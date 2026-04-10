-- ═══════════════════════════════════════════════════════════════════
-- FIX: Limpar posições duplicadas + adicionar UNIQUE constraint
--
-- Problema: webhooks simultâneos podem criar duas posições
-- para o mesmo lead no mesmo funil (race condition no SELECT).
-- Isso faz o lead aparecer duplicado no Kanban.
--
-- Rodar no SQL Editor do Supabase Dashboard
-- ═══════════════════════════════════════════════════════════════════

-- 1. Identificar duplicatas (preview)
SELECT lead_id, funnel_id, COUNT(*) as dupes
FROM lead_stage_positions
GROUP BY lead_id, funnel_id
HAVING COUNT(*) > 1;

-- 2. Remover duplicatas mantendo apenas a mais antiga (menor entered_at)
DELETE FROM lead_stage_positions
WHERE id IN (
  SELECT id FROM (
    SELECT id,
           ROW_NUMBER() OVER (PARTITION BY lead_id, funnel_id ORDER BY entered_at ASC) as rn
    FROM lead_stage_positions
  ) ranked
  WHERE rn > 1
);

-- 3. Adicionar constraint UNIQUE para prevenir futuras duplicatas
ALTER TABLE lead_stage_positions
  ADD CONSTRAINT unique_lead_per_funnel UNIQUE (lead_id, funnel_id);

-- 4. Atualizar a RPC sync_lead_from_sale para usar ON CONFLICT
-- (Substituir os INSERTs em lead_stage_positions por INSERT ... ON CONFLICT DO NOTHING)
--
-- Exemplo da mudança necessária na RPC:
--   ANTES:  INSERT INTO lead_stage_positions (lead_id, funnel_id, stage_id) VALUES (...)
--   DEPOIS: INSERT INTO lead_stage_positions (lead_id, funnel_id, stage_id) VALUES (...) ON CONFLICT (lead_id, funnel_id) DO NOTHING
