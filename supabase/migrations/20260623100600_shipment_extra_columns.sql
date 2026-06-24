-- Colunas extras na tela de Rastreios (alinhar com a planilha Santo Mato):
--   purchased_at    → data real da compra (campo DATA da planilha)
--   frete_value     → valor do frete (preenchido à mão na tela; não vem do Guru)
--   logistica_value → valor da logística (idem)
ALTER TABLE public.order_shipments
  ADD COLUMN IF NOT EXISTS purchased_at    timestamptz,
  ADD COLUMN IF NOT EXISTS frete_value     numeric,
  ADD COLUMN IF NOT EXISTS logistica_value numeric;

-- Popular purchased_at dos pedidos já existentes a partir da compra.
UPDATE public.order_shipments os
  SET purchased_at = cp.purchased_at
  FROM public.customer_purchases cp
  WHERE os.customer_purchase_id = cp.id
    AND os.purchased_at IS NULL;

-- Reaplica create_shipment_for_purchase passando a gravar purchased_at nos novos.
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
  IF v_p.product_type <> 'fisico' OR v_p.status <> 'authorized' THEN RETURN NULL; END IF;

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
