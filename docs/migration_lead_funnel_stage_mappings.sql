-- Mapeamento explícito de etapas para funis "Visão Geral"
-- target_funnel_id = funil destino (Visão Geral)
-- source_stage_id  = etapa de um funil agregado
-- target_stage_id  = coluna do funil destino onde a etapa de origem deve aparecer

CREATE TABLE IF NOT EXISTS public.lead_funnel_stage_mappings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  target_funnel_id uuid NOT NULL REFERENCES public.lead_funnels(id) ON DELETE CASCADE,
  source_stage_id  uuid NOT NULL REFERENCES public.lead_funnel_stages(id) ON DELETE CASCADE,
  target_stage_id  uuid NOT NULL REFERENCES public.lead_funnel_stages(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  UNIQUE(target_funnel_id, source_stage_id)
);

CREATE INDEX IF NOT EXISTS idx_lfsm_target ON public.lead_funnel_stage_mappings(target_funnel_id);
CREATE INDEX IF NOT EXISTS idx_lfsm_source ON public.lead_funnel_stage_mappings(source_stage_id);

ALTER TABLE public.lead_funnel_stage_mappings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "lfsm_all" ON public.lead_funnel_stage_mappings;
CREATE POLICY "lfsm_all" ON public.lead_funnel_stage_mappings
FOR ALL TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.lead_funnels lf
  WHERE lf.id = lead_funnel_stage_mappings.target_funnel_id
    AND lf.organization_id = public.get_user_org_id()
))
WITH CHECK (EXISTS (
  SELECT 1 FROM public.lead_funnels lf
  WHERE lf.id = lead_funnel_stage_mappings.target_funnel_id
    AND lf.organization_id = public.get_user_org_id()
));
