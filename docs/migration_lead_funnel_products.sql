-- Migration: Create lead_funnel_products table
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

CREATE INDEX IF NOT EXISTS idx_lead_funnel_products_funnel ON public.lead_funnel_products(lead_funnel_id);

ALTER TABLE public.lead_funnel_products ENABLE ROW LEVEL SECURITY;

CREATE POLICY "lead_funnel_products_all" ON public.lead_funnel_products
FOR ALL TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.lead_funnels lf
    WHERE lf.id = lead_funnel_products.lead_funnel_id
    AND lf.organization_id = public.get_user_org_id()
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.lead_funnels lf
    WHERE lf.id = lead_funnel_products.lead_funnel_id
    AND lf.organization_id = public.get_user_org_id()
  )
);

COMMENT ON TABLE public.lead_funnel_products IS 'Products linked to lead funnels with recontact configuration';
