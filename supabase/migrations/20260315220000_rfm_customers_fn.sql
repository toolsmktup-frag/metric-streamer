-- ═══════════════════════════════════════════════════════════════════
-- FUNÇÃO: fn_rfm_customers()
--
-- Retorna um registro por cliente unificado com os dados agregados
-- necessários para o cálculo de RFM no frontend:
--   total_revenue, purchase_count, last_purchase_at, first_purchase_at
--
-- INCLUI: Guru (customer_purchases) + Ticto (ticto_transactions)
-- EMAIL:  Guru → via customer_identity_links | Ticto → direto
-- NOME:   Ticto → customer_name              | Guru  → NULL
--
-- ROLLBACK: DROP FUNCTION public.fn_rfm_customers();
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

  -- ── Guru + Eduzz CSV ─────────────────────────────────────────────
  -- Email vem de customer_identity_links (LEFT JOIN — mantém mesmo sem email)
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
  -- Resolve email → unified_customer_id quando possível (evita duplicatas com Guru)
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
  'Retorna dados agregados por cliente unificado (Guru + Ticto) '
  'para cálculo de RFM. Usa customer_identity_links para unificar identidade.';

GRANT EXECUTE ON FUNCTION public.fn_rfm_customers() TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_rfm_customers() TO service_role;
