-- Migration: Create lead_product_mappings table for explicit product name mapping
-- Execute on Supabase Dashboard or via psql
-- Date: 2026-03-19

CREATE TABLE IF NOT EXISTS public.lead_product_mappings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_funnel_id uuid NOT NULL REFERENCES public.lead_funnels(id) ON DELETE CASCADE,
  raw_product_name text NOT NULL,
  lead_funnel_product_id uuid NOT NULL REFERENCES public.lead_funnel_products(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  UNIQUE(lead_funnel_id, raw_product_name)
);

CREATE INDEX IF NOT EXISTS idx_lead_product_mappings_funnel ON public.lead_product_mappings(lead_funnel_id);

ALTER TABLE public.lead_product_mappings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "lead_product_mappings_all" ON public.lead_product_mappings
FOR ALL TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.lead_funnels lf
    WHERE lf.id = lead_product_mappings.lead_funnel_id
    AND lf.organization_id = public.get_user_org_id()
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.lead_funnels lf
    WHERE lf.id = lead_product_mappings.lead_funnel_id
    AND lf.organization_id = public.get_user_org_id()
  )
);
