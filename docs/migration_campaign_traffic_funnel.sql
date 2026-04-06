-- Migration: Add traffic_funnel_id to lead_campaigns
-- Allows linking a traffic funnel at the campaign level (inherited by all lead funnels)
-- Execute on Supabase Dashboard → SQL Editor
-- Date: 2026-04-06

ALTER TABLE public.lead_campaigns
ADD COLUMN IF NOT EXISTS traffic_funnel_id uuid REFERENCES public.funnels(id) ON DELETE SET NULL;
