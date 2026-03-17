-- ═══════════════════════════════════════════════════════════════════
-- FIX: fn_rfm_customers() — fallback de nome via customer_identity_links
--
-- Problema: clientes sem email (ex: importados só com nome/telefone)
-- apareciam com UUID no dashboard RFM.
--
-- Causa: fn_rfm_customers só usava customer_name do Ticto como nome.
-- Clientes Guru sem email e sem transação Ticto ficavam sem nome.
-- Após o cleanup de identidade, nomes salvos como 'email' foram
-- movidos para type='name' — correto, mas agora precisam ser buscados.
--
-- Correção: adiciona CTE name_lookup que busca identifier_type='name'
-- em customer_identity_links e usa como fallback quando name é NULL.
--
-- ROLLBACK: DROP FUNCTION public.fn_rfm_customers();
--           + reexecutar 20260316090000_fix_rfm_customers_dedup_ticto.sql
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
    MIN(email) FILTER (WHERE email IS NOT NULL AND email <> '') AS email,
    MAX(name)  FILTER (WHERE name  IS NOT NULL AND name  <> '') AS name
  FROM all_purchases
  GROUP BY customer_id
),

-- Fallback de nome: busca identifier_type='name' para clientes sem nome
-- (ex: clientes Guru que só tinham nome salvo como 'email' — agora corrigido)
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
  COALESCE(cm.name, nf.alt_name)   AS name,
  SUM(ap.amount)::numeric           AS total_revenue,
  COUNT(*)::bigint                  AS purchase_count,
  MAX(ap.purchased_at)              AS last_purchase_at,
  MIN(ap.purchased_at)              AS first_purchase_at
FROM all_purchases ap
JOIN customer_meta cm    ON cm.customer_id = ap.customer_id
LEFT JOIN name_fallback nf ON nf.customer_id = ap.customer_id
GROUP BY ap.customer_id, cm.email, COALESCE(cm.name, nf.alt_name);
$$;

COMMENT ON FUNCTION public.fn_rfm_customers() IS
  'Retorna dados por cliente unificado (Guru + Ticto) para RFM. '
  'customer_purchases é fonte principal. ticto_transactions complementa apenas '
  'transações não importadas. name usa fallback de customer_identity_links type=name.';

GRANT EXECUTE ON FUNCTION public.fn_rfm_customers() TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_rfm_customers() TO service_role;
