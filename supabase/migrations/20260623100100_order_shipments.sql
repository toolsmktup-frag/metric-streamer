-- ═══════════════════════════════════════════════════════════════════
-- MÓDULO LOGÍSTICA / RASTREIOS — order_shipments
-- "Pedido de envio": uma linha por compra física aprovada que precisa
-- de envio. Reaproveita customer_purchases (origem Guru/Ticto/etc),
-- unified_customers (cliente normalizado) e o endereço guardado no
-- raw_data do webhook. Não duplica catálogo nem cliente — referencia.
-- Estratégia: additive only.
-- ═══════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.order_shipments (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id       uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE
                        DEFAULT '00000000-0000-0000-0000-000000000001',
  customer_purchase_id  uuid NOT NULL REFERENCES public.customer_purchases(id) ON DELETE CASCADE,
  unified_customer_id   uuid REFERENCES public.unified_customers(id) ON DELETE SET NULL,

  -- Snapshot do cliente (telefone é o que o disparo usa)
  customer_name         text,
  customer_phone        text,   -- apenas dígitos
  customer_email        text,
  customer_cpf          text,   -- apenas dígitos

  -- Produto / quantidade (já resolvidos em customer_purchases)
  product_name          text,
  quantity              int NOT NULL DEFAULT 1,

  -- Endereço de entrega (extraído do raw_data; editável na tela)
  ship_street           text,
  ship_number           text,
  ship_complement       text,
  ship_neighborhood     text,
  ship_city             text,
  ship_state            text,
  ship_zipcode          text,

  -- Integração Spedy / Nota Fiscal
  spedy_invoice_id      text,
  nf_number             text,
  nf_status             text,
  nf_xml_url            text,
  nf_pdf_url            text,
  nf_issued_at          timestamptz,

  -- Rastreio
  tracking_code         text,
  carrier               text,
  tracking_status       text,

  -- Disparo controlado (reaproveita engine wz-automation)
  dispatch_status       text NOT NULL DEFAULT 'aguardando_rastreio'
                        CHECK (dispatch_status IN ('aguardando_rastreio', 'na_fila', 'enviado', 'falhou')),
  dispatch_channel      text CHECK (dispatch_channel IN ('manychat', 'uazapi')),
  dispatched_at         timestamptz,
  wz_execution_id       uuid,

  notes                 text,
  created_by            uuid REFERENCES auth.users(id),
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),

  UNIQUE (customer_purchase_id)
);

CREATE INDEX IF NOT EXISTS idx_shipments_org              ON public.order_shipments(organization_id);
CREATE INDEX IF NOT EXISTS idx_shipments_dispatch_status  ON public.order_shipments(organization_id, dispatch_status);
CREATE INDEX IF NOT EXISTS idx_shipments_customer         ON public.order_shipments(unified_customer_id);
CREATE INDEX IF NOT EXISTS idx_shipments_tracking         ON public.order_shipments(tracking_code);
CREATE INDEX IF NOT EXISTS idx_shipments_spedy            ON public.order_shipments(spedy_invoice_id);
CREATE INDEX IF NOT EXISTS idx_shipments_nf_number        ON public.order_shipments(nf_number);

ALTER TABLE public.order_shipments ENABLE ROW LEVEL SECURITY;

-- Leitura para autenticados (app é interno, single-org); gating fino é via mod_rastreios no front.
CREATE POLICY "Authenticated read shipments"
  ON public.order_shipments FOR SELECT TO authenticated USING (true);

-- Logística cadastra rastreio / corrige endereço (escrita no app como usuário autenticado).
CREATE POLICY "Authenticated insert shipments"
  ON public.order_shipments FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Authenticated update shipments"
  ON public.order_shipments FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Service full access shipments"
  ON public.order_shipments FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ─────────────────────────────────────────────────────────────────
-- updated_at automático
-- ─────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.set_order_shipments_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_order_shipments_updated_at ON public.order_shipments;
CREATE TRIGGER trg_order_shipments_updated_at
  BEFORE UPDATE ON public.order_shipments
  FOR EACH ROW EXECUTE FUNCTION public.set_order_shipments_updated_at();

-- ─────────────────────────────────────────────────────────────────
-- create_shipment_for_purchase: cria o pedido de envio a partir de uma
-- compra física aprovada, extraindo endereço do raw_data (payload Guru).
-- Idempotente (UNIQUE customer_purchase_id). Retorna o id do shipment.
-- ─────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.create_shipment_for_purchase(p_purchase_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_p     public.customer_purchases%ROWTYPE;
  v_uc    public.unified_customers%ROWTYPE;
  v_cust  jsonb;
  v_ship  jsonb;
  v_phone text;
  v_cpf   text;
  v_id    uuid;
BEGIN
  SELECT * INTO v_p FROM public.customer_purchases WHERE id = p_purchase_id;
  IF NOT FOUND THEN RETURN NULL; END IF;
  IF v_p.product_type <> 'fisico' OR v_p.status <> 'authorized' THEN RETURN NULL; END IF;

  SELECT id INTO v_id FROM public.order_shipments WHERE customer_purchase_id = p_purchase_id;
  IF v_id IS NOT NULL THEN RETURN v_id; END IF;

  IF v_p.unified_customer_id IS NOT NULL THEN
    SELECT * INTO v_uc FROM public.unified_customers WHERE id = v_p.unified_customer_id;
  END IF;

  -- Guru manda os dados do cliente em `contact` (com chaves address*, doc...).
  v_cust := COALESCE(v_p.raw_data->'contact', v_p.raw_data->'customer', v_p.raw_data->'buyer', '{}'::jsonb);

  v_phone := NULLIF(regexp_replace(
    COALESCE(v_cust->>'phone_local_code', '') ||
    COALESCE(v_cust->>'phone_number', v_cust->>'phone', v_cust->>'telephone', ''),
    '[^0-9]', '', 'g'), '');

  v_cpf := NULLIF(regexp_replace(
    COALESCE(v_cust->>'doc', v_cust->>'cpf', v_cust->>'document', ''),
    '[^0-9]', '', 'g'), '');

  INSERT INTO public.order_shipments (
    organization_id, customer_purchase_id, unified_customer_id,
    customer_name, customer_phone, customer_email, customer_cpf,
    product_name, quantity,
    ship_street, ship_number, ship_complement, ship_neighborhood,
    ship_city, ship_state, ship_zipcode,
    dispatch_status
  ) VALUES (
    v_p.organization_id, v_p.id, v_p.unified_customer_id,
    COALESCE(v_uc.full_name, v_cust->>'name', v_cust->>'full_name'),
    COALESCE(v_uc.primary_phone, v_phone),
    COALESCE(v_uc.primary_email, NULLIF(lower(v_cust->>'email'), '')),
    COALESCE(v_uc.primary_cpf, v_cpf),
    v_p.product_name, COALESCE(v_p.quantity, 1),
    COALESCE(v_cust->>'address', v_cust->>'street', v_cust->>'address_street'),
    COALESCE(v_cust->>'address_number', v_cust->>'number'),
    COALESCE(v_cust->>'address_comp', v_cust->>'complement', v_cust->>'address_complement'),
    COALESCE(v_cust->>'address_district', v_cust->>'neighborhood', v_cust->>'bairro'),
    COALESCE(v_cust->>'address_city', v_cust->>'city', v_cust->>'cidade'),
    COALESCE(v_cust->>'address_state', v_cust->>'state', v_cust->>'estado', v_cust->>'uf'),
    COALESCE(v_cust->>'address_zip_code', v_cust->>'zipcode', v_cust->>'zip_code', v_cust->>'cep'),
    'aguardando_rastreio'
  )
  ON CONFLICT (customer_purchase_id) DO NOTHING
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

-- ─────────────────────────────────────────────────────────────────
-- Trigger: ao aprovar uma compra física, cria o pedido de envio.
-- ─────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.trg_create_shipment_from_purchase()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.product_type = 'fisico' AND NEW.status = 'authorized' THEN
    PERFORM public.create_shipment_for_purchase(NEW.id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_customer_purchases_shipment ON public.customer_purchases;
CREATE TRIGGER trg_customer_purchases_shipment
  AFTER INSERT OR UPDATE OF status, product_type ON public.customer_purchases
  FOR EACH ROW EXECUTE FUNCTION public.trg_create_shipment_from_purchase();

-- ─────────────────────────────────────────────────────────────────
-- Backfill: gera pedidos de envio para compras físicas aprovadas que
-- ainda não têm shipment. Rodar uma vez após aplicar a migration.
-- ─────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.sync_shipments_from_purchases()
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r record;
  n int := 0;
BEGIN
  FOR r IN
    SELECT cp.id
    FROM public.customer_purchases cp
    LEFT JOIN public.order_shipments os ON os.customer_purchase_id = cp.id
    WHERE cp.product_type = 'fisico'
      AND cp.status = 'authorized'
      AND os.id IS NULL
  LOOP
    IF public.create_shipment_for_purchase(r.id) IS NOT NULL THEN
      n := n + 1;
    END IF;
  END LOOP;
  RETURN n;
END;
$$;
