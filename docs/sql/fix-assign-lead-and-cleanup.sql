-- ============================================================
-- FIX: assign_lead_to_seller (404 → função estava faltando)
--      + cleanup defensivo de qualquer resquício de `user_roles`
--      + reaplicar ensure_lead_for_phone sem fallback de user_roles
--
-- Cole TUDO no SQL Editor do Supabase e rode. Idempotente.
-- ============================================================

-- =========================================================
-- PARTE 1: assign_lead_to_seller (RPC chamada por useAssignLead)
-- =========================================================

-- Drop variantes antigas pra evitar ambiguidade de assinatura
DROP FUNCTION IF EXISTS public.assign_lead_to_seller(uuid, uuid);
DROP FUNCTION IF EXISTS public.assign_lead_to_seller(p_lead_id uuid, p_assigned_to uuid);

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


-- =========================================================
-- PARTE 2: ensure_lead_for_phone — reaplicada SEM user_roles
-- (mata qualquer versão antiga que ainda tenha o fallback)
-- =========================================================

DROP FUNCTION IF EXISTS public.ensure_lead_for_phone(text, text);

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


-- =========================================================
-- PARTE 3: Diagnóstico — ver se ainda tem alguma função/policy
-- referenciando user_roles. Roda este SELECT no SQL Editor:
-- =========================================================
-- SELECT n.nspname || '.' || p.proname AS funcao
-- FROM pg_proc p
-- JOIN pg_namespace n ON n.oid = p.pronamespace
-- WHERE pg_get_functiondef(p.oid) ILIKE '%user_roles%'
--   AND n.nspname = 'public';
--
-- SELECT schemaname, tablename, policyname, qual::text
-- FROM pg_policies
-- WHERE qual::text ILIKE '%user_roles%'
--    OR with_check::text ILIKE '%user_roles%';


-- =========================================================
-- PARTE 4 (opcional): Limpar leads.name poluído com nome de instância
-- Roda só se quiser corrigir leads já criados.
-- =========================================================
-- UPDATE public.leads l
--    SET name = NULL, updated_at = now()
--   FROM public.wz_instances i
--  WHERE lower(trim(l.name)) = lower(trim(i.name));

-- ============================================================
-- FIM
-- ============================================================
