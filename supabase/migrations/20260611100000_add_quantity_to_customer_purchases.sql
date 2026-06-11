-- ════════════════════════════════════════════════════════════════════
-- Recompra/Recontato — Fase 1: estruturar a QUANTIDADE de potes por compra
--
-- Hoje a quantidade de potes só existe embutida no texto do offer_name
-- ("3 potes ArticulaBEM"). Sem ela, o cálculo de recompra não consegue
-- saber que 3 potes duram 90 dias e 6 potes duram 180. Esta migration
-- adiciona a quantidade resolvida (preenchida na ingestão dos webhooks e
-- por backfill histórico) + a fonte usada para resolvê-la (auditoria).
-- IDEMPOTENTE.
-- ════════════════════════════════════════════════════════════════════

ALTER TABLE public.customer_purchases
  ADD COLUMN IF NOT EXISTS quantity int NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS quantity_source text;

COMMENT ON COLUMN public.customer_purchases.quantity IS
  'Quantidade de unidades (potes) da compra. Base do cálculo de duração de estoque (quantity * dias_por_pote).';
COMMENT ON COLUMN public.customer_purchases.quantity_source IS
  'Como a quantidade foi resolvida: mapping | parser_potes | parser_dias | default. "default" = baixa confiança, revisar.';

-- Acelera a varredura por cliente nas compras autorizadas (usada pela RPC de recompra)
CREATE INDEX IF NOT EXISTS idx_customer_purchases_customer_status_date
  ON public.customer_purchases (unified_customer_id, status, purchased_at);

-- ROLLBACK:
-- DROP INDEX IF EXISTS public.idx_customer_purchases_customer_status_date;
-- ALTER TABLE public.customer_purchases DROP COLUMN IF EXISTS quantity, DROP COLUMN IF EXISTS quantity_source;
