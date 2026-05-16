-- Migration: M:N entre lead_funnels e lead_campaigns (funil "Visão Geral")
-- Permite que um funil de leads agregue leads vindos de múltiplas campanhas.
-- Rodar manual no Supabase Dashboard → SQL Editor
-- Data: 2026-05-16

CREATE TABLE IF NOT EXISTS public.lead_funnel_campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_funnel_id uuid NOT NULL REFERENCES public.lead_funnels(id) ON DELETE CASCADE,
  lead_campaign_id uuid NOT NULL REFERENCES public.lead_campaigns(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  UNIQUE(lead_funnel_id, lead_campaign_id)
);

CREATE INDEX IF NOT EXISTS idx_lfc_funnel ON public.lead_funnel_campaigns(lead_funnel_id);
CREATE INDEX IF NOT EXISTS idx_lfc_campaign ON public.lead_funnel_campaigns(lead_campaign_id);

ALTER TABLE public.lead_funnel_campaigns ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "lfc_all" ON public.lead_funnel_campaigns;
CREATE POLICY "lfc_all" ON public.lead_funnel_campaigns
FOR ALL TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.lead_funnels lf
  WHERE lf.id = lead_funnel_campaigns.lead_funnel_id
    AND lf.organization_id = public.get_user_org_id()
))
WITH CHECK (EXISTS (
  SELECT 1 FROM public.lead_funnels lf
  WHERE lf.id = lead_funnel_campaigns.lead_funnel_id
    AND lf.organization_id = public.get_user_org_id()
));

-- Backfill: replica a campaign_id atual (1:1) na tabela M:N
INSERT INTO public.lead_funnel_campaigns (lead_funnel_id, lead_campaign_id)
SELECT id, campaign_id FROM public.lead_funnels
WHERE campaign_id IS NOT NULL
ON CONFLICT DO NOTHING;

COMMENT ON TABLE public.lead_funnel_campaigns IS 'Campanhas adicionais agregadas por um funil de leads (visão geral)';
