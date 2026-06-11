-- ════════════════════════════════════════════════════════════════════
-- Recompra/Recontato — Fase 5: popular duração + antecedência dos produtos
-- do funil "RECOMPRA - POTES".
--
-- Mantém os recontact_days atuais (23/75/165/250/340), mas agora expressos
-- como (duração − antecedência), o que permite a RPC mapear a QUANTIDADE de
-- potes comprada → faixa de duração → dias de recontato.
-- O trigger trg_sync_recontact_days recalcula recontact_days automaticamente.
-- IDEMPOTENTE.
-- ════════════════════════════════════════════════════════════════════

UPDATE public.lead_funnel_products lfp
SET pot_duration_days = v.dur,
    reminder_days_before = v.rem
FROM (VALUES
  ('Articulabem Pote 30 dias',   30,  7),  -- 1 pote  → recontato 23
  ('Articulabem Pote Gratis',    30,  7),  -- grátis  → 23
  ('Articulabem Pote 90 dias',   90, 15),  -- 3 potes → 75
  ('Articulabem Pote 180 dias', 180, 15),  -- 6 potes → 165
  ('9 Potes Articulabem',       270, 20),  -- 9 potes → 250
  ('Articulabem Pote 360 dias', 360, 20)   -- 12 potes → 340
) AS v(name, dur, rem)
WHERE lfp.product_name_contains = v.name
  AND lfp.lead_funnel_id = '19f75912-295e-4c67-acad-275ce6849c5c';
