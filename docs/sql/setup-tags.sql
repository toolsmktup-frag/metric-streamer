-- ============================================
-- SETUP COMPLETO: Sistema de Tags de Lead
-- Rode TUDO de uma vez no SQL Editor do Supabase
-- ============================================

-- 1) Biblioteca de tags por organização
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

-- 2) Vínculo lead <-> tag
CREATE TABLE IF NOT EXISTS public.lead_tag_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  tag_id uuid NOT NULL REFERENCES public.lead_tags(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT lead_tag_assignments_unique UNIQUE (lead_id, tag_id)
);
CREATE INDEX IF NOT EXISTS idx_lead_tag_assignments_lead ON public.lead_tag_assignments(lead_id);
CREATE INDEX IF NOT EXISTS idx_lead_tag_assignments_tag ON public.lead_tag_assignments(tag_id);

-- 3) RLS
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

-- 4) RPC para o modal de gestão (lista + uso)
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

-- ============================================
-- FIM. Pronto pra usar o sistema de tags.
-- ============================================
