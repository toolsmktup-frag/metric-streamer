-- Adicionar coluna hide_values nas etapas do funil
-- Quando true, vendedores não veem os valores monetários nessa coluna
ALTER TABLE public.lead_funnel_stages 
  ADD COLUMN IF NOT EXISTS hide_values boolean NOT NULL DEFAULT false;
