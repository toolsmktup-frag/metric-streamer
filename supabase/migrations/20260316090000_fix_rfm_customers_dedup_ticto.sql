-- ═══════════════════════════════════════════════════════════════════
-- FIX CRÍTICO: fn_rfm_customers() — remove dupla contagem Ticto
--
-- Problema: fn_rfm_customers fazia UNION ALL de:
--   1. customer_purchases (inclui transações Ticto importadas via webhook)
--   2. ticto_transactions (fonte bruta — as mesmas transações)
--
-- Resultado: ~12.233 transações Ticto contadas 2x
--   → purchase_count dobrado (ex: 19 real → 38 no RFM)
--   → total_revenue dobrado (ex: R$4.427 real → R$8.854 no RFM)
--
-- Correção: no branch ticto_transactions, excluir as que já estão em
--   customer_purchases (matched por platform_order_id = order_id).
--   As 169 transações ainda não importadas continuam sendo capturadas.
--
-- ROLLBACK: DROP FUNCTION public.fn_rfm_customers();
--           + reexecutar 20260315220000_rfm_customers_fn.sql
-- ═══════════════════════════════════════════════════════════════════

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

  -- ── Guru + Ticto importado (customer_purchases é fonte unificada) ─
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

  -- ── Ticto bruto: SOMENTE transações ainda não importadas ──────────
  -- Evita dupla contagem com o branch acima
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
    ON  cil.identifier_value = LOWER(TRIM(tt.customer_email))
    AND cil.identifier_type  = 'email'
  WHERE tt.status        = 'authorized'
    AND tt.customer_email IS NOT NULL
    AND tt.customer_email <> ''
    AND tt.paid_amount    > 0
    -- Exclui transações já presentes em customer_purchases
    AND NOT EXISTS (
      SELECT 1
      FROM public.customer_purchases cp_exists
      WHERE cp_exists.platform          = 'ticto'
        AND cp_exists.platform_order_id = tt.order_id::text
    )

),

-- Melhor email/nome por customer_id (prioriza não-nulo)
customer_meta AS (
  SELECT
    customer_id,
    MAX(email) FILTER (WHERE email IS NOT NULL AND email <> '') AS email,
    MAX(name)  FILTER (WHERE name  IS NOT NULL AND name  <> '') AS name
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
  'customer_purchases é fonte principal. ticto_transactions complementa apenas '
  'transações ainda não importadas (NOT EXISTS customer_purchases).';

GRANT EXECUTE ON FUNCTION public.fn_rfm_customers() TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_rfm_customers() TO service_role;
