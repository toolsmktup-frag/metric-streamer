-- ═══════════════════════════════════════════════════════════════════
-- REGISTRO do backfill CRM recompra — executado em 04/07/2026 via
-- PostgREST (service role). Este arquivo é documentação, NÃO precisa
-- ser re-executado (as operações foram aplicadas e são idempotentes
-- apenas em parte).
--
-- Contexto (reporte do Matheus 04/07):
--   1. Compradores recentes não apareciam na etapa "Base de clientes"
--      com o timer (só 9 leads lá; 390 acumulados em "Compra Aprovada").
--   2. Entrada no funil dependia de mapeamento manual por nome EXATO de
--      oferta (lead_product_mappings) — ofertas novas ficavam de fora
--      (347 compradores fora do funil no total).
--   3. 214 leads presos com a vendedora "Luisa" (perfil BLOQUEADO desde
--      maio) — invisíveis no kanban das vendedoras ativas.
--
-- Funil: RECOMPRA - POTES (19f75912-295e-4c67-acad-275ce6849c5c)
-- Etapas: Base de clientes d0f0929c- | Compra Aprovada 2acce870-
-- Vendedoras: Gabriela 45af1069- (peso 90) | Silvia 30f1bf3c- (peso 10)
-- ═══════════════════════════════════════════════════════════════════

-- A) Entrada robusta: keyword genérica (pot_duration_days NULL de propósito —
--    linhas sem duração são ignoradas pelo timer/cron, valem só p/ entrada)
INSERT INTO lead_funnel_products
  (lead_funnel_id, product_name_contains, display_name, pot_duration_days, reminder_days_before)
VALUES
  ('19f75912-295e-4c67-acad-275ce6849c5c', 'Articulabem',
   'Articulabem (entrada genérica — qualquer oferta)', NULL, NULL);

-- D) Compra passa a cair direto na Base de clientes (timer contando)
UPDATE stage_transition_rules
SET to_stage_id = 'd0f0929c-22c8-4a7b-b6d6-7593dd34bcdd'  -- Base de clientes
WHERE funnel_id = '19f75912-295e-4c67-acad-275ce6849c5c'
  AND event_name = 'purchase';

-- A2) Backfill: leads de compradores Articulabem (authorized) que estavam
--     FORA do funil → posicionados na Base de clientes (347 inseridos;
--     o trigger trg_auto_distribute_on_entry distribuiu os sem dono).
--     Equivalente lógico:
-- INSERT INTO lead_stage_positions (lead_id, funnel_id, stage_id)
-- SELECT l.id, '19f75912-...', 'd0f0929c-...'
-- FROM leads l
-- JOIN unified_customers uc ON lower(uc.primary_email) = lower(l.email)
-- JOIN customer_purchases cp ON cp.unified_customer_id = uc.id
--   AND cp.status = 'authorized' AND cp.product_name ILIKE '%articulabem%'
-- ON CONFLICT (lead_id, funnel_id) DO NOTHING;

-- D2) 390 leads acumulados em "Compra Aprovada" → "Base de clientes"
-- UPDATE lead_stage_positions SET stage_id = 'd0f0929c-...'
-- WHERE funnel_id = '19f75912-...' AND stage_id = '2acce870-...';

-- B) Redistribuição 90/10: 225 leads (214 da Luisa bloqueada + 11 sem dono)
--    → Gabriela +203 / Silvia +22; lead_distribution_weights.assigned_count
--    atualizado para manter o balanceamento futuro.

-- Resultado final: funil 832 → 1180 leads; Base de clientes 9 → 746;
-- donos: Gabriela 1101, Silvia 79, Luisa 0, sem dono 0.
