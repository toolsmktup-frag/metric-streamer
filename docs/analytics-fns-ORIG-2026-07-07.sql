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
$function$
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
$function$
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
$function$
