-- Migration: Add traffic_funnel_id to lead_funnels
-- Links lead funnels (CRM) to traffic funnels (revenue/KPIs)
-- Execute on Supabase Dashboard
-- Date: 2026-04-06

ALTER TABLE public.lead_funnels 
ADD COLUMN IF NOT EXISTS traffic_funnel_id uuid REFERENCES public.funnels(id) ON DELETE SET NULL;
