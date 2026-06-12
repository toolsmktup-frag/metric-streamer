-- ============================================================================
-- FIX: dupla contagem Ticto/Eduzz nas funções de análise (RFM, Cohort,
--      Journeys, Cross-sell) — chave de dedup por transaction_hash
-- ============================================================================
-- CAUSA RAIZ (diagnóstico 2026-06-12):
--   O espelhamento em ticto_transactions é INTENCIONAL: process-import
--   (CSV Ticto E Eduzz) e eduzz-webhook gravam cada venda nas DUAS tabelas,
--   com cp.platform_transaction_id = tt.transaction_hash por construção.
--   v_all_sales trata isso (branch customer_purchases filtrado a 'guru'),
--   mas as funções de análise não:
--
--   • fn_cohort_analysis    — SEM dedup nenhum
--   • fn_customer_journeys  — SEM dedup nenhum
--   • fn_rfm_customers      — dedup com chave errada (platform='ticto' + order_id)
--   • fn_crosssell_matrix   — dedup com chave errada (idem)
--
--   A chave antiga só casava compras rotuladas platform='ticto'. Em prod
--   (2026-06-12): 50.280 compras Eduzz em customer_purchases, 50.203
--   espelhadas em ticto_transactions — TODAS contadas 2x no RFM/cross-sell
--   e tudo (ticto + eduzz) contado 2x no cohort/journeys.
--
-- CHAVE NOVA:  cp.platform IN ('ticto','eduzz')
--          AND cp.platform_transaction_id = tt.transaction_hash
--   - independe do rótulo de plataforma (pega os espelhos eduzz);
--   - granularidade de transação (a antiga, por order_id, suprimia cobranças
--     de assinatura ainda não importadas — 47 em prod, ex.: Clube Secreto
--     das Plantas — que voltam a contar corretamente);
--   - usa o índice único (platform, platform_transaction_id) do upsert.
--
-- Validação em prod (2026-06-12), branch tt autorizado/63.997 linhas:
--   chave antiga casava 12.652 · chave nova casa 62.802
--   (50.197 espelhos eduzz deixam de duplicar; 1.195 linhas tt-only,
--   webhook Ticto não importado, continuam contando)
--
-- fn_rfm_segment_summary deriva de fn_rfm_customers() → corrige transitivamente.
--
-- ROLLBACK: reexecutar 20260611120000 (rfm), 20260316000000 (cohort/journeys)
--           e 20260316100000 (crosssell).
-- ============================================================================


-- ── 1) fn_rfm_customers ─────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_rfm_customers()
 RETURNS TABLE(customer_id text, email text, name text, total_revenue numeric, purchase_count bigint, last_purchase_at timestamp with time zone, first_purchase_at timestamp with time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
WITH all_purchases AS (

  -- ── Guru + Eduzz + Ticto importado (customer_purchases é fonte unificada) ─
  SELECT
    cp.unified_customer_id::text   AS customer_id,
    cil.identifier_value           AS email,
    NULL::text                     AS name,
    cp.gross_amount::numeric       AS amount,
    cp.purchased_at::timestamptz   AS purchased_at,
    -- chave do pedido: agrupa order bump/upsell do mesmo checkout
    COALESCE(cp.platform || ':' || cp.platform_order_id, 'cp:' || cp.id::text) AS order_key
  FROM public.customer_purchases cp
  LEFT JOIN public.customer_identity_links cil
    ON  cil.unified_customer_id = cp.unified_customer_id
    AND cil.identifier_type     = 'email'
  WHERE cp.status               = 'authorized'
    AND cp.unified_customer_id IS NOT NULL
    AND cp.gross_amount         > 0

  UNION ALL

  -- ── Ticto bruto: SOMENTE transações ainda não espelhadas ──────────
  SELECT
    COALESCE(
      cil.unified_customer_id::text,
      'email:' || LOWER(TRIM(tt.customer_email))
    )                                   AS customer_id,
    LOWER(TRIM(tt.customer_email))      AS email,
    tt.customer_name                    AS name,
    (tt.paid_amount::numeric / 100.0)   AS amount,
    tt.order_date::timestamptz          AS purchased_at,
    'ticto:' || tt.order_id::text       AS order_key
  FROM public.ticto_transactions tt
  LEFT JOIN public.customer_identity_links cil
    ON  LOWER(TRIM(cil.identifier_value)) = LOWER(TRIM(tt.customer_email))
    AND cil.identifier_type               = 'email'
  WHERE tt.status        = 'authorized'
    AND tt.customer_email IS NOT NULL
    AND tt.customer_email <> ''
    AND tt.paid_amount    > 0
    -- Exclui espelhos: CSV Ticto/Eduzz e webhook Eduzz gravam nas duas
    -- tabelas com cp.platform_transaction_id = tt.transaction_hash
    AND NOT EXISTS (
      SELECT 1
      FROM public.customer_purchases cp_exists
      WHERE cp_exists.platform IN ('ticto', 'eduzz')
        AND cp_exists.platform_transaction_id = tt.transaction_hash
    )

),

-- Melhor email/nome por customer_id (prioriza não-nulo)
customer_meta AS (
  SELECT
    customer_id,
    MIN(email) FILTER (WHERE email IS NOT NULL AND email <> '') AS email,
    MAX(name)  FILTER (WHERE name  IS NOT NULL AND name  <> '') AS name
  FROM all_purchases
  GROUP BY customer_id
),

-- Fallback de nome: busca identifier_type='name' para clientes sem nome
name_fallback AS (
  SELECT
    unified_customer_id::text                              AS customer_id,
    MAX(identifier_value)                                  AS alt_name
  FROM public.customer_identity_links
  WHERE identifier_type = 'name'
  GROUP BY unified_customer_id
)

SELECT
  ap.customer_id,
  cm.email,
  COALESCE(cm.name, nf.alt_name)        AS name,
  SUM(ap.amount)::numeric                AS total_revenue,
  COUNT(DISTINCT ap.order_key)::bigint   AS purchase_count,  -- pedidos, não linhas
  MAX(ap.purchased_at)                   AS last_purchase_at,
  MIN(ap.purchased_at)                   AS first_purchase_at
FROM all_purchases ap
JOIN customer_meta cm    ON cm.customer_id = ap.customer_id
LEFT JOIN name_fallback nf ON nf.customer_id = ap.customer_id
GROUP BY ap.customer_id, cm.email, COALESCE(cm.name, nf.alt_name);
$function$;

COMMENT ON FUNCTION public.fn_rfm_customers() IS
  'Retorna dados por cliente unificado (Guru + Ticto + Eduzz) para RFM. '
  'customer_purchases é fonte principal. ticto_transactions complementa apenas '
  'transações não espelhadas (dedup por platform_transaction_id = transaction_hash).';

GRANT EXECUTE ON FUNCTION public.fn_rfm_customers() TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_rfm_customers() TO service_role;


-- ── 2) fn_cohort_analysis ───────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_cohort_analysis()
 RETURNS TABLE(cohort_month date, cohort_label text, customer_count bigint, avg_ltv_1m numeric, avg_ltv_2m numeric, avg_ltv_3m numeric, avg_ltv_6m numeric, avg_ltv_9m numeric, avg_ltv_12m numeric, total_revenue_1m numeric, months_since_cohort integer)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
WITH

-- ── Passo 1: Todas as compras autorizadas, unificadas por customer ──
all_purchases AS (

  -- Guru + Eduzz + Ticto importado (já têm unified_customer_id)
  SELECT
    cp.unified_customer_id::text      AS customer_id,
    cp.purchased_at::timestamptz      AS purchased_at,
    cp.gross_amount::numeric          AS revenue
  FROM public.customer_purchases cp
  WHERE cp.status = 'authorized'
    AND cp.unified_customer_id IS NOT NULL
    AND cp.gross_amount > 0

  UNION ALL

  -- Ticto bruto: SOMENTE transações ainda não espelhadas
  SELECT
    COALESCE(
      cil.unified_customer_id::text,
      'email:' || LOWER(TRIM(tt.customer_email))
    )                                   AS customer_id,
    tt.order_date::timestamptz          AS purchased_at,
    (tt.paid_amount::numeric / 100.0)   AS revenue
  FROM public.ticto_transactions tt
  LEFT JOIN public.customer_identity_links cil
    ON  LOWER(TRIM(cil.identifier_value)) = LOWER(TRIM(tt.customer_email))
    AND cil.identifier_type               = 'email'
  WHERE tt.status        = 'authorized'
    AND tt.customer_email IS NOT NULL
    AND tt.customer_email <> ''
    AND tt.paid_amount    > 0
    -- Exclui espelhos (CSV Ticto/Eduzz + webhook Eduzz gravam nas duas tabelas)
    AND NOT EXISTS (
      SELECT 1
      FROM public.customer_purchases cp_exists
      WHERE cp_exists.platform IN ('ticto', 'eduzz')
        AND cp_exists.platform_transaction_id = tt.transaction_hash
    )

),

-- ── Passo 2: Primeira compra de cada cliente (âncora do cohort) ────
first_purchase AS (
  SELECT
    customer_id,
    MIN(purchased_at) AS first_at
  FROM all_purchases
  GROUP BY customer_id
),

-- ── Passo 3: Cohort = mês da primeira compra ───────────────────────
customer_cohorts AS (
  SELECT
    customer_id,
    first_at,
    DATE_TRUNC('month', first_at)::date AS cohort_month
  FROM first_purchase
),

-- ── Passo 4: LTV acumulado por janela, por cliente ─────────────────
customer_ltv AS (
  SELECT
    cc.cohort_month,
    cc.customer_id,
    SUM(CASE WHEN p.purchased_at <= cc.first_at + INTERVAL '1 month'   THEN p.revenue ELSE 0 END) AS ltv_1m,
    SUM(CASE WHEN p.purchased_at <= cc.first_at + INTERVAL '2 months'  THEN p.revenue ELSE 0 END) AS ltv_2m,
    SUM(CASE WHEN p.purchased_at <= cc.first_at + INTERVAL '3 months'  THEN p.revenue ELSE 0 END) AS ltv_3m,
    SUM(CASE WHEN p.purchased_at <= cc.first_at + INTERVAL '6 months'  THEN p.revenue ELSE 0 END) AS ltv_6m,
    SUM(CASE WHEN p.purchased_at <= cc.first_at + INTERVAL '9 months'  THEN p.revenue ELSE 0 END) AS ltv_9m,
    SUM(CASE WHEN p.purchased_at <= cc.first_at + INTERVAL '12 months' THEN p.revenue ELSE 0 END) AS ltv_12m
  FROM customer_cohorts cc
  JOIN all_purchases p ON p.customer_id = cc.customer_id
  GROUP BY cc.cohort_month, cc.customer_id
),

-- ── Passo 5: Agrega por cohort ─────────────────────────────────────
cohort_agg AS (
  SELECT
    cohort_month,
    COUNT(DISTINCT customer_id)                AS customer_count,
    ROUND(AVG(ltv_1m)::numeric,  2)            AS avg_ltv_1m,
    ROUND(AVG(ltv_2m)::numeric,  2)            AS avg_ltv_2m,
    ROUND(AVG(ltv_3m)::numeric,  2)            AS avg_ltv_3m,
    ROUND(AVG(ltv_6m)::numeric,  2)            AS avg_ltv_6m,
    ROUND(AVG(ltv_9m)::numeric,  2)            AS avg_ltv_9m,
    ROUND(AVG(ltv_12m)::numeric, 2)            AS avg_ltv_12m,
    ROUND(SUM(ltv_1m)::numeric,  2)            AS total_revenue_1m
  FROM customer_ltv
  GROUP BY cohort_month
)

-- ── Resultado final com label e meses de vida do cohort ───────────
SELECT
  ca.cohort_month,
  TO_CHAR(ca.cohort_month, 'Mon/YYYY')                AS cohort_label,
  ca.customer_count,
  ca.avg_ltv_1m,
  ca.avg_ltv_2m,
  ca.avg_ltv_3m,
  ca.avg_ltv_6m,
  ca.avg_ltv_9m,
  ca.avg_ltv_12m,
  ca.total_revenue_1m,
  (
    EXTRACT(YEAR  FROM AGE(CURRENT_DATE, ca.cohort_month)) * 12 +
    EXTRACT(MONTH FROM AGE(CURRENT_DATE, ca.cohort_month))
  )::integer AS months_since_cohort
FROM cohort_agg ca
WHERE ca.cohort_month >= '2023-01-01'
ORDER BY ca.cohort_month ASC;
$function$;

COMMENT ON FUNCTION public.fn_cohort_analysis() IS
  'Retorna matriz de Cohort LTV por mês de primeira compra. '
  'customer_purchases é fonte principal; ticto_transactions complementa apenas '
  'transações não espelhadas (dedup por platform_transaction_id = transaction_hash).';

GRANT EXECUTE ON FUNCTION public.fn_cohort_analysis() TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_cohort_analysis() TO service_role;


-- ── 3) fn_customer_journeys ─────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_customer_journeys()
 RETURNS TABLE(customer_id text, product_name text, amount numeric, purchased_at timestamp with time zone, platform text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$

-- ── customer_purchases: Guru + Eduzz + Ticto importado ──────────
SELECT
  cp.unified_customer_id::text   AS customer_id,
  cp.product_name                AS product_name,
  cp.gross_amount::numeric       AS amount,
  cp.purchased_at::timestamptz   AS purchased_at,
  COALESCE(cp.platform, 'guru')  AS platform
FROM public.customer_purchases cp
WHERE cp.status               = 'authorized'
  AND cp.unified_customer_id IS NOT NULL
  AND cp.gross_amount         > 0

UNION ALL

-- ── ticto_transactions: SOMENTE transações ainda não espelhadas ──
SELECT
  COALESCE(
    cil.unified_customer_id::text,
    'email:' || LOWER(TRIM(tt.customer_email))
  )                                   AS customer_id,
  tt.product_name                     AS product_name,
  (tt.paid_amount::numeric / 100.0)   AS amount,
  tt.order_date::timestamptz          AS purchased_at,
  'ticto'                             AS platform
FROM public.ticto_transactions tt
LEFT JOIN public.customer_identity_links cil
  ON  LOWER(TRIM(cil.identifier_value)) = LOWER(TRIM(tt.customer_email))
  AND cil.identifier_type               = 'email'
WHERE tt.status        = 'authorized'
  AND tt.customer_email IS NOT NULL
  AND tt.customer_email <> ''
  AND tt.paid_amount    > 0
  -- Exclui espelhos (CSV Ticto/Eduzz + webhook Eduzz gravam nas duas tabelas)
  AND NOT EXISTS (
    SELECT 1
    FROM public.customer_purchases cp_exists
    WHERE cp_exists.platform IN ('ticto', 'eduzz')
      AND cp_exists.platform_transaction_id = tt.transaction_hash
  )

ORDER BY purchased_at ASC;
$function$;

COMMENT ON FUNCTION public.fn_customer_journeys() IS
  'Retorna todas as compras autorizadas (Guru + Ticto + Eduzz) com identidade '
  'unificada. customer_purchases é fonte principal; ticto_transactions complementa '
  'apenas transações não espelhadas (dedup por transaction_hash).';

GRANT EXECUTE ON FUNCTION public.fn_customer_journeys() TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_customer_journeys() TO service_role;


-- ── 4) fn_crosssell_matrix ──────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_crosssell_matrix()
 RETURNS TABLE(product_a text, product_b text, buyers_both bigint, buyers_of_a bigint, cross_sell_pct numeric)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH all_purchases AS (

    -- Guru + Eduzz + Ticto importado (customer_purchases é fonte unificada)
    SELECT
      unified_customer_id::text AS customer_id,
      product_name
    FROM public.customer_purchases
    WHERE status = 'authorized'
      AND unified_customer_id IS NOT NULL
      AND product_name IS NOT NULL

    UNION ALL

    -- Ticto bruto: SOMENTE transações ainda não espelhadas
    SELECT
      COALESCE(
        cil.unified_customer_id::text,
        'email:' || LOWER(TRIM(tt.customer_email))
      ) AS customer_id,
      tt.product_name
    FROM public.ticto_transactions tt
    LEFT JOIN public.customer_identity_links cil
      ON  LOWER(TRIM(cil.identifier_value)) = LOWER(TRIM(tt.customer_email))
      AND cil.identifier_type = 'email'
    WHERE tt.status = 'authorized'
      AND tt.product_name IS NOT NULL
      -- Exclui espelhos (CSV Ticto/Eduzz + webhook Eduzz gravam nas duas tabelas)
      AND NOT EXISTS (
        SELECT 1
        FROM public.customer_purchases cp_exists
        WHERE cp_exists.platform IN ('ticto', 'eduzz')
          AND cp_exists.platform_transaction_id = tt.transaction_hash
      )
  ),

  -- Um registro por (cliente, produto) — elimina duplicatas residuais
  customer_products AS (
    SELECT DISTINCT customer_id, product_name
    FROM all_purchases
  ),

  -- Total de compradores únicos por produto
  product_totals AS (
    SELECT product_name, COUNT(DISTINCT customer_id) AS total_buyers
    FROM customer_products
    GROUP BY product_name
  ),

  -- Pares: clientes que compraram produto A E produto B
  pairs AS (
    SELECT
      a.product_name AS product_a,
      b.product_name AS product_b,
      COUNT(DISTINCT a.customer_id) AS buyers_both
    FROM customer_products a
    JOIN customer_products b
      ON  a.customer_id  = b.customer_id
      AND a.product_name <> b.product_name
    GROUP BY a.product_name, b.product_name
  )

  SELECT
    p.product_a,
    p.product_b,
    p.buyers_both,
    pt.total_buyers AS buyers_of_a,
    ROUND((p.buyers_both::numeric / NULLIF(pt.total_buyers, 0) * 100), 1) AS cross_sell_pct
  FROM pairs p
  JOIN product_totals pt ON pt.product_name = p.product_a
  WHERE pt.total_buyers >= 5
  ORDER BY p.product_a, cross_sell_pct DESC;
$function$;

COMMENT ON FUNCTION public.fn_crosssell_matrix() IS
  'Matriz de cross-sell por par de produtos. customer_purchases é fonte principal; '
  'ticto_transactions complementa apenas transações não espelhadas '
  '(dedup por platform_transaction_id = transaction_hash).';

GRANT EXECUTE ON FUNCTION public.fn_crosssell_matrix() TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_crosssell_matrix() TO service_role;
