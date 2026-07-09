-- ─────────────────────────────────────────────────────────────────
-- Catálogo de produtos que geram envio (rastreio).
--
-- Problema: o pedido de envio só nascia quando product_type='fisico',
-- e essa classificação vem da inferência do guru-webhook — vendas
-- manuais (platform='manual') e webhooks antigos marcavam 'digital'
-- e a venda NUNCA aparecia na tela /rastreios.
--
-- Solução (mesmo padrão durável do funnel_products): tabela
-- shipping_products com padrões de nome configuráveis pela tela;
-- a compra paga vira pedido de envio se product_type='fisico' OU se
-- o nome do produto bater num padrão ativo do catálogo.
-- ─────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.shipping_products (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_name_contains text NOT NULL UNIQUE,
  display_name          text,
  active                boolean NOT NULL DEFAULT true,
  created_at            timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.shipping_products ENABLE ROW LEVEL SECURITY;

-- App interno single-org: autenticados gerenciam o catálogo (a tela
-- restringe a edição a quem não é logística-only).
CREATE POLICY "Authenticated read shipping products"
  ON public.shipping_products FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated write shipping products"
  ON public.shipping_products FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Service full access shipping products"
  ON public.shipping_products FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Seed: padrões dos produtos físicos reais da Santo Mato/Soulnaturi.
-- CUIDADO ao adicionar padrões curtos: 'pote' pegaria "Potencializar"
-- (produto digital) — por isso o match é por marca do produto.
INSERT INTO public.shipping_products (product_name_contains, display_name) VALUES
  ('articulabem', 'ArticulaBEM (potes)'),
  ('supervita',   'SuperVITA (potes)'),
  ('revitasoul',  'RevitaSoul (potes)'),
  ('necessaire',  'Necessaire'),
  ('ecobag',      'Ecobag')
ON CONFLICT (product_name_contains) DO NOTHING;

-- Verdadeiro se o nome do produto bate num padrão ativo do catálogo.
CREATE OR REPLACE FUNCTION public.is_shipping_product(p_name text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.shipping_products sp
    WHERE sp.active
      AND COALESCE(p_name, '') ILIKE '%' || sp.product_name_contains || '%'
  );
$$;

-- ─────────────────────────────────────────────────────────────────
-- create_shipment_for_purchase: gate passa a aceitar o catálogo.
-- (Corpo idêntico ao de prod; muda SÓ a condição de elegibilidade.)
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
  v_phone text;
  v_cpf   text;
  v_id    uuid;
BEGIN
  SELECT * INTO v_p FROM public.customer_purchases WHERE id = p_purchase_id;
  IF NOT FOUND THEN RETURN NULL; END IF;
  IF v_p.status <> 'authorized' THEN RETURN NULL; END IF;
  IF v_p.product_type <> 'fisico' AND NOT public.is_shipping_product(v_p.product_name) THEN
    RETURN NULL;
  END IF;

  SELECT id INTO v_id FROM public.order_shipments WHERE customer_purchase_id = p_purchase_id;
  IF v_id IS NOT NULL THEN RETURN v_id; END IF;

  IF v_p.unified_customer_id IS NOT NULL THEN
    SELECT * INTO v_uc FROM public.unified_customers WHERE id = v_p.unified_customer_id;
  END IF;

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
    product_name, quantity, purchased_at,
    ship_street, ship_number, ship_complement, ship_neighborhood,
    ship_city, ship_state, ship_zipcode,
    dispatch_status
  ) VALUES (
    v_p.organization_id, v_p.id, v_p.unified_customer_id,
    COALESCE(v_uc.full_name, v_cust->>'name', v_cust->>'full_name'),
    COALESCE(v_uc.primary_phone, v_phone),
    COALESCE(v_uc.primary_email, NULLIF(lower(v_cust->>'email'), '')),
    COALESCE(v_uc.primary_cpf, v_cpf),
    v_p.product_name, COALESCE(v_p.quantity, 1), v_p.purchased_at,
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

-- Trigger: dispara em qualquer compra aprovada; a decisão físico/não
-- fica dentro da create_shipment_for_purchase (product_type OU catálogo).
CREATE OR REPLACE FUNCTION public.trg_create_shipment_from_purchase()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'authorized' THEN
    PERFORM public.create_shipment_for_purchase(NEW.id);
  END IF;
  RETURN NEW;
END;
$$;

-- ─────────────────────────────────────────────────────────────────
-- Backfill com corte operacional: a tela vale de 10/06 em diante
-- (antes disso os envios saíram pela planilha — não recriar ruído).
-- ─────────────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.sync_shipments_from_purchases();

CREATE OR REPLACE FUNCTION public.sync_shipments_from_purchases(p_since date DEFAULT '2026-06-10')
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
    WHERE cp.status = 'authorized'
      AND (cp.product_type = 'fisico' OR public.is_shipping_product(cp.product_name))
      AND COALESCE(cp.purchased_at, cp.created_at) >= p_since
      AND os.id IS NULL
  LOOP
    IF public.create_shipment_for_purchase(r.id) IS NOT NULL THEN
      n := n + 1;
    END IF;
  END LOOP;
  RETURN n;
END;
$$;
