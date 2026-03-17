-- ═══════════════════════════════════════════════════════════════════
-- FUNÇÃO: fn_customer_journeys()
--
-- Retorna todas as compras autorizadas com identidade de cliente
-- unificada entre plataformas.
--
-- PROBLEMA QUE RESOLVE:
--   No frontend JS, ticto_transactions e customer_purchases são
--   consultados separadamente. Um cliente que comprou pela Guru
--   (unified_customer_id) E pela Ticto (email) aparecia como 2
--   clientes distintos, fragmentando LTV e CPA.
--
-- SOLUÇÃO:
--   Para ticto_transactions, tenta resolver o email do cliente em
--   unified_customer_id via customer_identity_links. Se achar, usa
--   o mesmo ID da Guru. Se não achar, usa 'email:xxx' como fallback.
--
-- RESULTADO:
--   LTV, Escada de Valor, Cross-sell e Perfis passam a operar sobre
--   a base real de clientes, sem duplicação de identidade.
--
-- ROLLBACK: DROP FUNCTION public.fn_customer_journeys();
-- ═══════════════════════════════════════════════════════════════════

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
  ON  cil.identifier_value = LOWER(TRIM(tt.customer_email))
  AND cil.identifier_type  = 'email'
WHERE tt.status        = 'authorized'
  AND tt.customer_email IS NOT NULL
  AND tt.customer_email <> ''
  AND tt.paid_amount    > 0

ORDER BY purchased_at ASC;
$$;

COMMENT ON FUNCTION public.fn_customer_journeys() IS
  'Retorna todas as compras autorizadas (Guru + Ticto) com identidade '
  'unificada. Ticto rows com email conhecido em customer_identity_links '
  'recebem o unified_customer_id da Guru — evitando fragmentação de LTV.';

-- Permissões
GRANT EXECUTE ON FUNCTION public.fn_customer_journeys() TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_customer_journeys() TO service_role;
