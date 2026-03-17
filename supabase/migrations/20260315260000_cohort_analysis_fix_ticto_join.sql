-- ═══════════════════════════════════════════════════════════════════
-- FIX: fn_cohort_analysis — LEFT JOIN para Ticto
--
-- PROBLEMA ANTERIOR: INNER JOIN excluía clientes Ticto que nunca
-- compraram na Guru (sem registro em customer_identity_links).
-- Estimativa: 20-40% dos clientes Ticto eram invisíveis no Cohort.
--
-- SOLUÇÃO: LEFT JOIN + COALESCE fallback (igual a fn_rfm_customers),
-- usando 'email:{email}' como ID quando não há unified_customer_id.
--
-- ROLLBACK: restaurar versão anterior com INNER JOIN.
-- ═══════════════════════════════════════════════════════════════════

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

  -- Ticto: LEFT JOIN para incluir clientes Ticto-only (sem conta Guru)
  -- COALESCE fallback = 'email:{email}' para não perder esses clientes
  SELECT
    COALESCE(
      cil.unified_customer_id::text,
      'email:' || LOWER(TRIM(tt.customer_email))
    )                                   AS customer_id,
    tt.order_date::timestamptz          AS purchased_at,
    (tt.paid_amount::numeric / 100.0)   AS revenue
  FROM public.ticto_transactions tt
  LEFT JOIN public.customer_identity_links cil
    ON  cil.identifier_value = LOWER(TRIM(tt.customer_email))
    AND cil.identifier_type  = 'email'
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
  'Fontes: customer_purchases (Guru/Eduzz) + ticto_transactions (LEFT JOIN — inclui Ticto-only). '
  'Janelas: 1m, 2m, 3m, 6m, 9m, 12m após first_purchase.';

GRANT EXECUTE ON FUNCTION public.fn_cohort_analysis() TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_cohort_analysis() TO service_role;
