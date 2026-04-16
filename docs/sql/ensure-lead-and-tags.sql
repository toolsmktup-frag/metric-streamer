-- ============================================
-- SETUP: Sistema de Tags + RPC ensure_lead_for_phone
-- Cole TUDO no SQL Editor do Supabase e rode de uma vez
-- Idempotente: pode rodar de novo sem quebrar
-- ============================================

-- =========================================================
-- PARTE 1: Sistema de Tags (caso ainda não tenha rodado)
-- =========================================================

CREATE TABLE IF NOT EXISTS public.lead_tags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  color text NOT NULL DEFAULT '#64748b',
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT lead_tags_name_not_empty CHECK (length(trim(name)) > 0),
  CONSTRAINT lead_tags_org_name_unique UNIQUE (organization_id, name)
);
CREATE INDEX IF NOT EXISTS idx_lead_tags_org ON public.lead_tags(organization_id);

CREATE TABLE IF NOT EXISTS public.lead_tag_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  tag_id uuid NOT NULL REFERENCES public.lead_tags(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT lead_tag_assignments_unique UNIQUE (lead_id, tag_id)
);
CREATE INDEX IF NOT EXISTS idx_lead_tag_assignments_lead ON public.lead_tag_assignments(lead_id);
CREATE INDEX IF NOT EXISTS idx_lead_tag_assignments_tag ON public.lead_tag_assignments(tag_id);

ALTER TABLE public.lead_tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lead_tag_assignments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "lead_tags org access" ON public.lead_tags;
CREATE POLICY "lead_tags org access" ON public.lead_tags
  FOR ALL TO authenticated
  USING (organization_id = public.get_user_org_id())
  WITH CHECK (organization_id = public.get_user_org_id());

DROP POLICY IF EXISTS "lead_tag_assignments org access" ON public.lead_tag_assignments;
CREATE POLICY "lead_tag_assignments org access" ON public.lead_tag_assignments
  FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.leads l WHERE l.id = lead_tag_assignments.lead_id AND l.organization_id = public.get_user_org_id())
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.leads l WHERE l.id = lead_tag_assignments.lead_id AND l.organization_id = public.get_user_org_id())
  );

CREATE OR REPLACE FUNCTION public.get_org_tags_with_usage()
RETURNS TABLE (id uuid, name text, color text, usage_count bigint, created_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT t.id, t.name, t.color, COUNT(a.id)::bigint AS usage_count, t.created_at
  FROM public.lead_tags t
  LEFT JOIN public.lead_tag_assignments a ON a.tag_id = t.id
  WHERE t.organization_id = public.get_user_org_id()
  GROUP BY t.id, t.name, t.color, t.created_at
  ORDER BY t.name ASC;
$$;
GRANT EXECUTE ON FUNCTION public.get_org_tags_with_usage() TO authenticated;


-- =========================================================
-- PARTE 2: RPC ensure_lead_for_phone
-- Garante que existe um lead para o telefone do chat.
-- Se não existir, cria. Se for vendedor, atribui ao próprio.
-- Retorna a linha completa do lead.
-- =========================================================

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

  -- Descobre papel do usuário (best effort — se a tabela não existir, assume admin)
  BEGIN
    SELECT role::text INTO v_role
    FROM public.user_roles
    WHERE user_id = v_user_id
    ORDER BY CASE role::text WHEN 'admin' THEN 1 WHEN 'gestor' THEN 2 ELSE 3 END
    LIMIT 1;
  EXCEPTION WHEN undefined_table THEN
    v_role := 'admin';
  END;

  v_digits := regexp_replace(p_phone, '\D', '', 'g');

  -- Variações de telefone (mesma lógica do useLeadByPhone)
  v_variations := ARRAY[p_phone, v_digits, '+' || v_digits];
  IF v_digits LIKE '55%' AND length(v_digits) >= 12 THEN
    v_variations := v_variations || substring(v_digits FROM 3);
  ELSIF length(v_digits) BETWEEN 10 AND 11 THEN
    v_variations := v_variations || ('55' || v_digits) || ('+55' || v_digits);
  END IF;

  -- Tenta achar lead existente da MESMA org
  SELECT * INTO v_lead
  FROM public.leads
  WHERE organization_id = v_org_id
    AND phone = ANY(v_variations)
  ORDER BY created_at DESC
  LIMIT 1;

  IF FOUND THEN
    -- Se vendedor sem assigned_to, reivindica para si (mesma lógica de seller-assignment)
    IF v_role NOT IN ('admin', 'gestor') AND v_lead.assigned_to IS NULL THEN
      UPDATE public.leads
      SET assigned_to = v_user_id, updated_at = now()
      WHERE id = v_lead.id
      RETURNING * INTO v_lead;
    END IF;
    RETURN v_lead;
  END IF;

  -- Cria novo lead
  v_assign_to := CASE WHEN v_role NOT IN ('admin', 'gestor') THEN v_user_id ELSE NULL END;

  INSERT INTO public.leads (organization_id, phone, name, assigned_to, source)
  VALUES (
    v_org_id,
    COALESCE(NULLIF(v_digits, ''), p_phone),
    NULLIF(trim(coalesce(p_name, '')), ''),
    v_assign_to,
    'whatsapp_chat'
  )
  RETURNING * INTO v_lead;

  -- Registra evento de criação
  BEGIN
    INSERT INTO public.lead_events (lead_id, event_name, metadata)
    VALUES (v_lead.id, 'criado', jsonb_build_object('source', 'whatsapp_contact_panel'));
  EXCEPTION WHEN OTHERS THEN
    NULL; -- não falha a criação por causa do evento
  END;

  RETURN v_lead;
END;
$$;

GRANT EXECUTE ON FUNCTION public.ensure_lead_for_phone(text, text) TO authenticated;

-- ============================================
-- FIM
-- ============================================
