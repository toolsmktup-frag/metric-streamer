-- Migration: Add auto_move_stage_id to lead_funnel_products
-- Execute manually on Supabase Dashboard (external instance)
-- Date: 2026-03-19

ALTER TABLE public.lead_funnel_products 
ADD COLUMN IF NOT EXISTS auto_move_stage_id uuid REFERENCES public.lead_funnel_stages(id) ON DELETE SET NULL;
