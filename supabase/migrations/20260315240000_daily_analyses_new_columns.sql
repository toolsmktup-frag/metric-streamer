-- ═══════════════════════════════════════════════════════════════════
-- MIGRATION: Adiciona colunas constraint_of_day e ltv_cac_ratio
-- na tabela daily_analyses.
--
-- Necessário para persistir os novos campos retornados pelo
-- Agente IA (análise diária com visão Hormozi).
--
-- ROLLBACK:
--   ALTER TABLE public.daily_analyses DROP COLUMN IF EXISTS constraint_of_day;
--   ALTER TABLE public.daily_analyses DROP COLUMN IF EXISTS ltv_cac_ratio;
-- ═══════════════════════════════════════════════════════════════════

ALTER TABLE public.daily_analyses
  ADD COLUMN IF NOT EXISTS constraint_of_day text,
  ADD COLUMN IF NOT EXISTS ltv_cac_ratio     text;

COMMENT ON COLUMN public.daily_analyses.constraint_of_day IS
  'Principal constraint/gargalo do negócio identificado pela IA naquele dia (teoria das restrições — Hormozi).';

COMMENT ON COLUMN public.daily_analyses.ltv_cac_ratio IS
  'Ratio LTV:CAC calculado pela IA para o período analisado.';
