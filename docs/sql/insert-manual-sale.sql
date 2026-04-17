-- ═══════════════════════════════════════════════════════════════════
-- RPC: insert_manual_sale
-- Permite admin/gestor registrar uma venda PIX direto vinculada a uma
-- vendedora. A venda entra em customer_purchases com platform='manual'
-- e affiliate_name = nome da vendedora, caindo automaticamente nos
-- dashboards (CRM Analytics + Minhas Metas) via match fuzzy existente.
-- Rodar no SQL Editor do Supabase Dashboard.
-- ═══════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.insert_manual_sale(
  p_seller_id      uuid,
  p_product_name   text,
  p_amount         numeric,
  p_commission_pct numeric,
  p_sale_date      timestamptz
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_id   uuid;
  v_caller_role text;
  v_org_id      uuid;
  v_seller_org  uuid;
  v_seller_name text;
  v_commission  numeric;
  v_new_id      uuid;
BEGIN
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Não autenticado';
  END IF;

  -- Validar caller (admin/gestor) e pegar org
  SELECT role, organization_id
    INTO v_caller_role, v_org_id
  FROM public.user_profiles
  WHERE id = v_caller_id;

  IF v_caller_role IS NULL OR v_caller_role NOT IN ('admin', 'gestor') THEN
    RAISE EXCEPTION 'Sem permissão: apenas admin ou gestor podem inserir vendas manuais';
  END IF;

  -- Validar inputs
  IF p_product_name IS NULL OR length(trim(p_product_name)) = 0 THEN
    RAISE EXCEPTION 'Produto é obrigatório';
  END IF;
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'Valor deve ser maior que zero';
  END IF;
  IF p_commission_pct IS NULL OR p_commission_pct < 0 OR p_commission_pct > 100 THEN
    RAISE EXCEPTION 'Comissão deve estar entre 0 e 100';
  END IF;
  IF p_sale_date IS NULL OR p_sale_date > now() THEN
    RAISE EXCEPTION 'Data da venda inválida';
  END IF;

  -- Validar vendedora: existe, mesma org, não é admin
  SELECT full_name, organization_id
    INTO v_seller_name, v_seller_org
  FROM public.user_profiles
  WHERE id = p_seller_id;

  IF v_seller_name IS NULL THEN
    RAISE EXCEPTION 'Vendedora não encontrada';
  END IF;
  IF v_seller_org IS DISTINCT FROM v_org_id THEN
    RAISE EXCEPTION 'Vendedora não pertence à sua organização';
  END IF;

  v_commission := round((p_amount * p_commission_pct / 100.0)::numeric, 2);
  v_new_id := gen_random_uuid();

  INSERT INTO public.customer_purchases (
    id,
    organization_id,
    unified_customer_id,
    platform,
    ingestion_type,
    status,
    product_name,
    gross_amount,
    net_amount,
    affiliate_name,
    affiliate_commission,
    purchased_at,
    created_at,
    updated_at,
    raw_data
  ) VALUES (
    v_new_id,
    v_org_id,
    NULL,
    'manual',
    'manual',
    'authorized',
    trim(p_product_name),
    p_amount,
    p_amount,
    v_seller_name,
    v_commission,
    p_sale_date,
    now(),
    now(),
    jsonb_build_object(
      'manual_entry', true,
      'created_by', v_caller_id,
      'commission_pct', p_commission_pct,
      'seller_id', p_seller_id
    )
  );

  RETURN v_new_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.insert_manual_sale(uuid, text, numeric, numeric, timestamptz) TO authenticated;
