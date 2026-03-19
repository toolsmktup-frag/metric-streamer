-- Migration: Create lead_funnel_products table
-- Links products (with recontact config) to lead funnels
-- Can optionally reference a funnel_product from the catalog
-- Execute manually on Supabase Dashboard (external instance)
-- Date: 2026-03-19

CREATE TABLE IF NOT EXISTS public.lead_funnel_products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_funnel_id uuid NOT NULL REFERENCES public.lead_funnels(id) ON DELETE CASCADE,
  source_funnel_product_id uuid REFERENCES public.funnel_products(id) ON DELETE SET NULL,
  product_name_contains text NOT NULL,
  display_name text,
  recontact_days integer DEFAULT NULL,
  created_at timestamptz DEFAULT now()
);

-- Index for fast lookups by funnel
CREATE INDEX IF NOT EXISTS idx_lead_funnel_products_funnel ON public.lead_funnel_products(lead_funnel_id);

-- RLS
ALTER TABLE public.lead_funnel_products ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage lead_funnel_products via org"
ON public.lead_funnel_products
FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.lead_funnels lf
    JOIN public.organization_members om ON om.organization_id = lf.organization_id
    WHERE lf.id = lead_funnel_products.lead_funnel_id
    AND om.user_id = auth.uid()
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.lead_funnels lf
    JOIN public.organization_members om ON om.organization_id = lf.organization_id
    WHERE lf.id = lead_funnel_products.lead_funnel_id
    AND om.user_id = auth.uid()
  )
);

COMMENT ON TABLE public.lead_funnel_products IS 'Products linked to lead funnels with recontact configuration';
COMMENT ON COLUMN public.lead_funnel_products.source_funnel_product_id IS 'Optional FK to catalog product in funnel_products';
COMMENT ON COLUMN public.lead_funnel_products.recontact_days IS 'Days after purchase for recontact countdown';
