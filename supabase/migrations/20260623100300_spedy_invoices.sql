-- ═══════════════════════════════════════════════════════════════════
-- INTEGRAÇÃO SPEDY — Notas Fiscais + de-para com pedidos
-- A NF já é emitida no Spedy na compra; aqui só recebemos (webhook) e
-- baixamos XML/PDF. spedy_invoices guarda TODA nota recebida (inclusive
-- as que ainda não casaram com um pedido = órfãs) para reconciliação.
-- ═══════════════════════════════════════════════════════════════════

-- Bucket de notas (PDF/XML). Path inclui uuid → não-adivinhável; app interno.
INSERT INTO storage.buckets (id, name, public)
VALUES ('notas-fiscais', 'notas-fiscais', true)
ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.spedy_invoices (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id     uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE
                      DEFAULT '00000000-0000-0000-0000-000000000001',
  spedy_invoice_id    text NOT NULL,
  nf_number           text,
  nf_series           text,
  nf_status           text,
  nf_issued_at        timestamptz,

  -- Identificadores para de-para com customer_purchases / order_shipments
  reference           text,   -- referência externa que a nota carrega (order/transaction id)
  buyer_cpf           text,   -- apenas dígitos
  buyer_email         text,
  buyer_name          text,

  xml_url             text,
  pdf_url             text,

  matched_shipment_id uuid REFERENCES public.order_shipments(id) ON DELETE SET NULL,
  raw                 jsonb,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),

  UNIQUE (spedy_invoice_id)
);

CREATE INDEX IF NOT EXISTS idx_spedy_invoices_match   ON public.spedy_invoices(matched_shipment_id);
CREATE INDEX IF NOT EXISTS idx_spedy_invoices_cpf     ON public.spedy_invoices(buyer_cpf);
CREATE INDEX IF NOT EXISTS idx_spedy_invoices_email   ON public.spedy_invoices(buyer_email);
CREATE INDEX IF NOT EXISTS idx_spedy_invoices_ref     ON public.spedy_invoices(reference);

ALTER TABLE public.spedy_invoices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated read spedy_invoices"
  ON public.spedy_invoices FOR SELECT TO authenticated USING (true);

CREATE POLICY "Service full access spedy_invoices"
  ON public.spedy_invoices FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP TRIGGER IF EXISTS trg_spedy_invoices_updated_at ON public.spedy_invoices;
CREATE TRIGGER trg_spedy_invoices_updated_at
  BEFORE UPDATE ON public.spedy_invoices
  FOR EACH ROW EXECUTE FUNCTION public.set_order_shipments_updated_at();

-- ─────────────────────────────────────────────────────────────────
-- De-para / reconciliação
-- ─────────────────────────────────────────────────────────────────

-- Pedidos físicos pagos que ainda NÃO têm nota casada (precisa emitir/conferir).
CREATE OR REPLACE VIEW public.v_shipments_sem_nf AS
SELECT os.*
FROM public.order_shipments os
WHERE os.nf_number IS NULL
  AND os.spedy_invoice_id IS NULL;

-- Notas do Spedy que NÃO casaram com nenhum pedido (órfãs).
CREATE OR REPLACE VIEW public.v_nf_orfas AS
SELECT si.*
FROM public.spedy_invoices si
WHERE si.matched_shipment_id IS NULL;
