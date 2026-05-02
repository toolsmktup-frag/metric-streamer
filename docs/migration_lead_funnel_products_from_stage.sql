-- ════════════════════════════════════════════════════════════════════
-- Migration: Add auto_move_FROM_stage_id to lead_funnel_products
--
-- PROBLEMA: O cron de recontato (recontact-cron) hoje move QUALQUER lead
-- vencido pra etapa configurada, atropelando trabalho da vendedora
-- (leads em "Aguardando resposta", "Em negociação" etc. são movidos).
--
-- SOLUÇÃO: Adicionar coluna `auto_move_from_stage_id` que define DE QUAL
-- etapa o lead pode ser movido. Se NULL → comportamento antigo (qualquer
-- etapa). Se preenchido → só move se o lead estiver naquela etapa.
--
-- Execute manualmente no Supabase Dashboard.
-- Data: 2026-05-02
-- ════════════════════════════════════════════════════════════════════

-- 1. Adicionar coluna
ALTER TABLE public.lead_funnel_products
ADD COLUMN IF NOT EXISTS auto_move_from_stage_id uuid
  REFERENCES public.lead_funnel_stages(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.lead_funnel_products.auto_move_from_stage_id IS
  'Etapa de origem: o cron só move o lead se ele estiver nesta etapa. NULL = move de qualquer etapa (legacy).';

-- 2. Backfill: para todos os produtos JÁ configurados com auto_move_stage_id,
--    setar auto_move_from_stage_id = primeira etapa (sort_order=0) do funil.
--    Isso garante que vendas existentes continuem funcionando, mas com a
--    proteção: só move quem ainda está parado na etapa inicial.
UPDATE public.lead_funnel_products lfp
SET auto_move_from_stage_id = (
  SELECT id FROM public.lead_funnel_stages
  WHERE funnel_id = lfp.lead_funnel_id
  ORDER BY sort_order ASC
  LIMIT 1
)
WHERE lfp.auto_move_stage_id IS NOT NULL
  AND lfp.auto_move_from_stage_id IS NULL;

-- 3. Verificação
SELECT
  lf.name AS funnel,
  lfp.product_name_contains,
  lfp.recontact_days,
  (SELECT name FROM lead_funnel_stages WHERE id = lfp.auto_move_from_stage_id) AS from_stage,
  (SELECT name FROM lead_funnel_stages WHERE id = lfp.auto_move_stage_id) AS to_stage
FROM lead_funnel_products lfp
JOIN lead_funnels lf ON lf.id = lfp.lead_funnel_id
WHERE lfp.auto_move_stage_id IS NOT NULL
ORDER BY lf.name;
