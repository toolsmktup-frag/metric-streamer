-- Planilha Santo Mato vira BASE fiel: pedidos importados da planilha podem não
-- ter uma venda (webhook) vinculada. Permite customer_purchase_id nulo e marca
-- a origem do pedido. As vendas que entram pelos webhooks continuam 'webhook'.
ALTER TABLE public.order_shipments
  ALTER COLUMN customer_purchase_id DROP NOT NULL;

ALTER TABLE public.order_shipments
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'webhook'
    CHECK (source IN ('webhook', 'planilha', 'manual')),
  ADD COLUMN IF NOT EXISTS planilha_shipped_at date;

-- UNIQUE(customer_purchase_id) permanece: vários NULLs não conflitam no Postgres.
CREATE INDEX IF NOT EXISTS idx_shipments_source ON public.order_shipments(source);
