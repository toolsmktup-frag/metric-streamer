-- Migration: M:N entre lead_funnels e funnels (funis de tráfego)
-- Permite vincular múltiplos funis de tráfego a um mesmo funil de lead
-- (ex.: Infoprodutos ← Guia das Tinturas + Mestre das Tinturas).
-- Rodar manual no Supabase Dashboard → SQL Editor
-- Date: 2026-05-17

CREATE TABLE IF NOT EXISTS public.lead_funnel_traffic_funnels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_funnel_id uuid NOT NULL REFERENCES public.lead_funnels(id) ON DELETE CASCADE,
  traffic_funnel_id uuid NOT NULL REFERENCES public.funnels(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  UNIQUE(lead_funnel_id, traffic_funnel_id)
);

CREATE INDEX IF NOT EXISTS idx_lftf_lead_funnel ON public.lead_funnel_traffic_funnels(lead_funnel_id);
CREATE INDEX IF NOT EXISTS idx_lftf_traffic_funnel ON public.lead_funnel_traffic_funnels(traffic_funnel_id);

ALTER TABLE public.lead_funnel_traffic_funnels ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "lftf_all" ON public.lead_funnel_traffic_funnels;
CREATE POLICY "lftf_all" ON public.lead_funnel_traffic_funnels
FOR ALL TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.lead_funnels lf
  WHERE lf.id = lead_funnel_traffic_funnels.lead_funnel_id
    AND lf.organization_id = public.get_user_org_id()
))
WITH CHECK (EXISTS (
  SELECT 1 FROM public.lead_funnels lf
  WHERE lf.id = lead_funnel_traffic_funnels.lead_funnel_id
    AND lf.organization_id = public.get_user_org_id()
));

-- Backfill: replica o traffic_funnel_id atual (1:1) para a M:N
INSERT INTO public.lead_funnel_traffic_funnels (lead_funnel_id, traffic_funnel_id)
SELECT id, traffic_funnel_id FROM public.lead_funnels
WHERE traffic_funnel_id IS NOT NULL
ON CONFLICT DO NOTHING;

COMMENT ON TABLE public.lead_funnel_traffic_funnels IS 'Funis de tráfego adicionais associados a um funil de lead (multi-source)';
