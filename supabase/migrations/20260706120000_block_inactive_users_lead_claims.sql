-- ═══════════════════════════════════════════════════════════════════
-- Usuário BLOQUEADO não pode reivindicar/receber leads (incidente 06/07)
--
-- A Luisa (user_profiles.status = 'blocked') seguia com sessão de auth
-- válida em algum aparelho; o auto-claim do painel de WhatsApp
-- (ensure_lead_for_phone) atribuía leads órfãos a ela segundos após a
-- distribuição — 3 leads "sumiram" das vendedoras ativas em 05-06/07.
--
-- Guardas adicionadas (fonte: docs/sql/fix-assign-lead-and-cleanup.sql):
--   • caller com status <> 'active' → exceção nas duas RPCs;
--   • assign_lead_to_seller também recusa ATRIBUIR PARA usuário inativo.
-- ═══════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.assign_lead_to_seller(
  p_lead_id uuid,
  p_assigned_to uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_org_id  uuid;
  v_role    text;
  v_current uuid;
  v_lead_org uuid;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Não autenticado';
  END IF;

  -- Usuário bloqueado/inativo não opera leads (sessão antiga ainda válida)
  IF EXISTS (
    SELECT 1 FROM public.user_profiles
    WHERE id = v_user_id AND status <> 'active'
  ) THEN
    RAISE EXCEPTION 'Usuário inativo/bloqueado';
  END IF;

  -- Não atribuir lead PARA usuário inativo/bloqueado
  IF p_assigned_to IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.user_profiles
    WHERE id = p_assigned_to AND status <> 'active'
  ) THEN
    RAISE EXCEPTION 'Destinatário inativo/bloqueado';
  END IF;

  v_org_id := public.get_user_org_id();
  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'Usuário sem organização';
  END IF;

  -- Role: APENAS user_profiles (fonte de verdade)
  SELECT role::text INTO v_role
  FROM public.user_profiles
  WHERE id = v_user_id
  LIMIT 1;
  v_role := COALESCE(v_role, 'vendedor');

  -- Carrega lead da MESMA org
  SELECT assigned_to, organization_id
    INTO v_current, v_lead_org
  FROM public.leads
  WHERE id = p_lead_id;

  IF NOT FOUND OR v_lead_org IS DISTINCT FROM v_org_id THEN
    RAISE EXCEPTION 'Lead não encontrado';
  END IF;

  -- Vendedor: só pode reivindicar lead órfão OU transferir pra si mesmo
  IF v_role NOT IN ('admin', 'gestor') THEN
    IF v_current IS NOT NULL
       AND v_current <> v_user_id
       AND p_assigned_to IS DISTINCT FROM v_user_id THEN
      RAISE EXCEPTION 'Sem permissão para transferir este lead';
    END IF;
  END IF;

  UPDATE public.leads
     SET assigned_to = p_assigned_to,
         updated_at  = now()
   WHERE id = p_lead_id;

  -- Evento de auditoria (best effort)
  BEGIN
    INSERT INTO public.lead_events (lead_id, event_name, metadata)
    VALUES (
      p_lead_id,
      'lead_assigned',
      jsonb_build_object(
        'assigned_to', p_assigned_to,
        'previous_assigned_to', v_current,
        'changed_by', v_user_id
      )
    );
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;
END;
$$;

GRANT EXECUTE ON FUNCTION public.assign_lead_to_seller(uuid, uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.ensure_lead_for_phone(
  p_phone text,
  p_name  text DEFAULT NULL
)
RETURNS public.leads
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id      uuid;
  v_user_id     uuid := auth.uid();
  v_role        text;
  v_digits      text;
  v_variations  text[];
  v_lead        public.leads;
  v_assign_to   uuid;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Não autenticado';
  END IF;

  -- Usuário bloqueado/inativo não abre contato nem reivindica lead
  IF EXISTS (
    SELECT 1 FROM public.user_profiles
    WHERE id = v_user_id AND status <> 'active'
  ) THEN
    RAISE EXCEPTION 'Usuário inativo/bloqueado';
  END IF;

  IF p_phone IS NULL OR length(trim(p_phone)) = 0 THEN
    RAISE EXCEPTION 'Telefone obrigatório';
  END IF;

  v_org_id := public.get_user_org_id();
  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'Usuário sem organização';
  END IF;

  -- Role: APENAS user_profiles (sem fallback pra user_roles)
  SELECT role::text INTO v_role
  FROM public.user_profiles
  WHERE id = v_user_id
  LIMIT 1;
  v_role := COALESCE(v_role, 'vendedor');

  v_digits := regexp_replace(p_phone, '\D', '', 'g');

  v_variations := ARRAY[p_phone, v_digits, '+' || v_digits];
  IF v_digits LIKE '55%' AND length(v_digits) >= 12 THEN
    v_variations := v_variations || substring(v_digits FROM 3);
  ELSIF length(v_digits) BETWEEN 10 AND 11 THEN
    v_variations := v_variations || ('55' || v_digits) || ('+55' || v_digits);
  END IF;

  SELECT * INTO v_lead
  FROM public.leads
  WHERE organization_id = v_org_id
    AND phone = ANY(v_variations)
  ORDER BY created_at DESC
  LIMIT 1;

  IF FOUND THEN
    IF v_role NOT IN ('admin', 'gestor') AND v_lead.assigned_to IS NULL THEN
      UPDATE public.leads
      SET assigned_to = v_user_id, updated_at = now()
      WHERE id = v_lead.id
      RETURNING * INTO v_lead;
    END IF;
    RETURN v_lead;
  END IF;

  v_assign_to := CASE WHEN v_role NOT IN ('admin', 'gestor') THEN v_user_id ELSE NULL END;

  INSERT INTO public.leads (organization_id, phone, name, assigned_to, metadata)
  VALUES (
    v_org_id,
    COALESCE(NULLIF(v_digits, ''), p_phone),
    NULLIF(trim(coalesce(p_name, '')), ''),
    v_assign_to,
    jsonb_build_object('source', 'whatsapp_chat', 'created_via', 'whatsapp_contact_panel')
  )
  RETURNING * INTO v_lead;

  BEGIN
    INSERT INTO public.lead_events (lead_id, event_name, metadata)
    VALUES (v_lead.id, 'criado', jsonb_build_object('source', 'whatsapp_contact_panel'));
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

  RETURN v_lead;
END;
$$;

GRANT EXECUTE ON FUNCTION public.ensure_lead_for_phone(text, text) TO authenticated;
