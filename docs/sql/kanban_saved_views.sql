-- ============================================================
-- Kanban Saved Views — visões salvas de filtros do Kanban por funil
-- Compartilhadas entre todos os membros com acesso ao funil.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.kanban_saved_views (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  funnel_id uuid NOT NULL REFERENCES public.lead_funnels(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL,
  name text NOT NULL,
  filters jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_kanban_saved_views_funnel
  ON public.kanban_saved_views(funnel_id);

CREATE INDEX IF NOT EXISTS idx_kanban_saved_views_org
  ON public.kanban_saved_views(organization_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.kanban_saved_views TO authenticated;
GRANT ALL ON public.kanban_saved_views TO service_role;

ALTER TABLE public.kanban_saved_views ENABLE ROW LEVEL SECURITY;

-- SELECT: qualquer usuário com acesso ao funil pode ver as visões
DROP POLICY IF EXISTS "kanban_views_select" ON public.kanban_saved_views;
CREATE POLICY "kanban_views_select"
  ON public.kanban_saved_views FOR SELECT TO authenticated
  USING (public.has_funnel_access(auth.uid(), funnel_id));

-- INSERT: precisa ter acesso ao funil + organização tem que bater
DROP POLICY IF EXISTS "kanban_views_insert" ON public.kanban_saved_views;
CREATE POLICY "kanban_views_insert"
  ON public.kanban_saved_views FOR INSERT TO authenticated
  WITH CHECK (
    public.has_funnel_access(auth.uid(), funnel_id)
    AND organization_id = public.get_user_org_id()
  );

-- UPDATE: qualquer membro com acesso ao funil
DROP POLICY IF EXISTS "kanban_views_update" ON public.kanban_saved_views;
CREATE POLICY "kanban_views_update"
  ON public.kanban_saved_views FOR UPDATE TO authenticated
  USING (public.has_funnel_access(auth.uid(), funnel_id))
  WITH CHECK (public.has_funnel_access(auth.uid(), funnel_id));

-- DELETE: criador ou admin/gestor
DROP POLICY IF EXISTS "kanban_views_delete" ON public.kanban_saved_views;
CREATE POLICY "kanban_views_delete"
  ON public.kanban_saved_views FOR DELETE TO authenticated
  USING (
    created_by = auth.uid()
    OR public.get_user_role() IN ('admin', 'gestor')
  );

-- Trigger updated_at
CREATE OR REPLACE FUNCTION public.kanban_saved_views_touch_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_kanban_saved_views_updated_at ON public.kanban_saved_views;
CREATE TRIGGER trg_kanban_saved_views_updated_at
  BEFORE UPDATE ON public.kanban_saved_views
  FOR EACH ROW EXECUTE FUNCTION public.kanban_saved_views_touch_updated_at();
