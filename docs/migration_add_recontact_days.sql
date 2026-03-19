-- Migration: Add recontact_days to funnel_products
-- Execute manually on Supabase Dashboard (external instance)
-- Date: 2026-03-19

ALTER TABLE public.funnel_products
ADD COLUMN IF NOT EXISTS recontact_days integer DEFAULT NULL;

COMMENT ON COLUMN public.funnel_products.recontact_days IS 'Days after purchase when lead should be recontacted for repurchase';
