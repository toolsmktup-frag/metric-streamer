-- ═══════════════════════════════════════════════════════════════════
-- FIX: Normalização de case no JOIN de emails
--
-- BUG #8 — LOWER(TRIM) faltando no lado esquerdo do JOIN
--   Impacto: se customer_identity_links armazena 'User@Gmail.com'
--   e a query compara com LOWER(TRIM(tt.customer_email)) = 'user@gmail.com',
--   o JOIN falha e o cliente recebe ID 'email:user@gmail.com' em vez de
--   seu unified_customer_id → fragmentação de LTV, escada e cross-sell.
--   Fix: aplicar LOWER(TRIM()) em AMBOS os lados do JOIN.
--
-- BUG #13 — MAX(email) seleciona email alfabeticamente maior
--   Impacto: cosmético, mas indeterminístico. Ex: 'z@foo.com' ganha
--   sobre 'a@foo.com' mesmo que 'a@' seja o email principal do cliente.
--   Fix: MIN(email) → retorna o email que vem primeiro alfabeticamente,
--   comportamento consistente e determinístico.
--
-- Funções afetadas:
--   • fn_customer_journeys  (Bug #8)
--   • fn_rfm_customers      (Bug #8 + Bug #13)
--   • fn_cohort_analysis    (Bug #8 — variante da mesma função)
-- ═══════════════════════════════════════════════════════════════════

-- ─── 1. fn_customer_journeys ───────────────────────────────────────

CREATE OR REPLACE FUNCTION public.fn_customer_journeys()
RETURNS TABLE (
  customer_id   text,
  product_name  text,
  amount        numeric,
  purchased_at  timestamptz,
  platform      text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$

-- ── customer_purchases: Guru + Eduzz CSV ────────────────────────
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

-- ── ticto_transactions: resolve email → unified_customer_id ─────
-- Fix #8: LOWER(TRIM()) em AMBOS os lados para garantir match
-- independente de como o email foi gravado em customer_identity_links.
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

ORDER BY purchased_at ASC;
$$;

COMMENT ON FUNCTION public.fn_customer_journeys() IS
  'Retorna todas as compras autorizadas (Guru + Ticto) com identidade '
  'unificada. JOIN de email case-insensitive (LOWER em ambos os lados) '
  'para evitar fragmentação por diferença de capitalização.';

GRANT EXECUTE ON FUNCTION public.fn_customer_journeys() TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_customer_journeys() TO service_role;


-- ─── 2. fn_rfm_customers ──────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.fn_rfm_customers()
RETURNS TABLE (
  customer_id       text,
  email             text,
  name              text,
  total_revenue     numeric,
  purchase_count    bigint,
  last_purchase_at  timestamptz,
  first_purchase_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
WITH all_purchases AS (

  -- ── Guru + Eduzz CSV ─────────────────────────────────────────────
  SELECT
    cp.unified_customer_id::text   AS customer_id,
    cil.identifier_value           AS email,
    NULL::text                     AS name,
    cp.gross_amount::numeric       AS amount,
    cp.purchased_at::timestamptz   AS purchased_at
  FROM public.customer_purchases cp
  LEFT JOIN public.customer_identity_links cil
    ON  cil.unified_customer_id = cp.unified_customer_id
    AND cil.identifier_type     = 'email'
  WHERE cp.status               = 'authorized'
    AND cp.unified_customer_id IS NOT NULL
    AND cp.gross_amount         > 0

  UNION ALL

  -- ── Ticto ────────────────────────────────────────────────────────
  -- Fix #8: LOWER(TRIM()) em AMBOS os lados do JOIN
  SELECT
    COALESCE(
      cil.unified_customer_id::text,
      'email:' || LOWER(TRIM(tt.customer_email))
    )                                   AS customer_id,
    LOWER(TRIM(tt.customer_email))      AS email,
    tt.customer_name                    AS name,
    (tt.paid_amount::numeric / 100.0)   AS amount,
    tt.order_date::timestamptz          AS purchased_at
  FROM public.ticto_transactions tt
  LEFT JOIN public.customer_identity_links cil
    ON  LOWER(TRIM(cil.identifier_value)) = LOWER(TRIM(tt.customer_email))
    AND cil.identifier_type               = 'email'
  WHERE tt.status        = 'authorized'
    AND tt.customer_email IS NOT NULL
    AND tt.customer_email <> ''
    AND tt.paid_amount    > 0

),

-- Fix #13: MIN(email) em vez de MAX(email) → determinístico
customer_meta AS (
  SELECT
    customer_id,
    MIN(email) FILTER (WHERE email IS NOT NULL AND email <> '') AS email,
    MIN(name)  FILTER (WHERE name  IS NOT NULL AND name  <> '') AS name
  FROM all_purchases
  GROUP BY customer_id
)

SELECT
  ap.customer_id,
  cm.email,
  cm.name,
  SUM(ap.amount)::numeric     AS total_revenue,
  COUNT(*)::bigint            AS purchase_count,
  MAX(ap.purchased_at)        AS last_purchase_at,
  MIN(ap.purchased_at)        AS first_purchase_at
FROM all_purchases ap
JOIN customer_meta cm ON cm.customer_id = ap.customer_id
GROUP BY ap.customer_id, cm.email, cm.name;
$$;

COMMENT ON FUNCTION public.fn_rfm_customers() IS
  'Retorna dados agregados por cliente unificado (Guru + Ticto) para RFM. '
  'JOIN de email case-insensitive. MIN(email) para resultado determinístico.';

GRANT EXECUTE ON FUNCTION public.fn_rfm_customers() TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_rfm_customers() TO service_role;


-- ─── 3. fn_cohort_analysis — mesma correção de JOIN ───────────────
-- (já usava LEFT JOIN após fix do bug #7, mas faltava LOWER nos dois lados)

CREATE OR REPLACE FUNCTION public.fn_cohort_analysis()
RETURNS TABLE (
  cohort_month        date,
  cohort_label        text,
  customer_count      bigint,
  avg_ltv_1m          numeric,
  avg_ltv_2m          numeric,
  avg_ltv_3m          numeric,
  avg_ltv_6m          numeric,
  avg_ltv_9m          numeric,
  avg_ltv_12m         numeric,
  total_revenue_1m    numeric,
  months_since_cohort integer
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
WITH

-- ── Passo 1: Todas as compras autorizadas, unificadas por customer ──
all_purchases AS (

  -- Guru + Eduzz CSV (já têm unified_customer_id)
  SELECT
    cp.unified_customer_id::text      AS customer_id,
    cp.purchased_at::timestamptz      AS purchased_at,
    cp.gross_amount::numeric          AS revenue
  FROM public.customer_purchases cp
  WHERE cp.status = 'authorized'
    AND cp.unified_customer_id IS NOT NULL
    AND cp.gross_amount > 0

  UNION ALL

  -- Ticto: LEFT JOIN + LOWER em ambos os lados (Fix #8)
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
$$;

COMMENT ON FUNCTION public.fn_cohort_analysis() IS
  'Retorna matriz de Cohort LTV por mês de primeira compra. '
  'Fontes: customer_purchases (Guru/Eduzz) + ticto_transactions (LEFT JOIN). '
  'JOIN de email case-insensitive. Janelas: 1m, 2m, 3m, 6m, 9m, 12m.';

GRANT EXECUTE ON FUNCTION public.fn_cohort_analysis() TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_cohort_analysis() TO service_role;
