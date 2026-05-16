-- Migration: adiciona flag para "ignorar funil de tráfego" sem violar FK
-- Rodar no Supabase Dashboard → SQL Editor
-- Date: 2026-05-16

ALTER TABLE public.lead_funnels
  ADD COLUMN IF NOT EXISTS ignore_traffic_funnel boolean NOT NULL DEFAULT false;

ALTER TABLE public.lead_campaigns
  ADD COLUMN IF NOT EXISTS ignore_traffic_funnel boolean NOT NULL DEFAULT false;
