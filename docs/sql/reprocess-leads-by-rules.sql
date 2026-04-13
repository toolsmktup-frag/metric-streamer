-- ═══════════════════════════════════════════════════════════════════
-- REPROCESSAR LEADS: Mover leads antigos para etapas corretas
-- baseado no último evento registrado + regras de transição.
--
-- COMO USAR:
-- 1. Substituir 'SEU_FUNNEL_ID_AQUI' pelo UUID do funil
-- 2. Rodar o SELECT de preview primeiro para validar
-- 3. Rodar o UPDATE final
--
-- Rodar no SQL Editor do Supabase Dashboard
-- ═══════════════════════════════════════════════════════════════════

-- ▸ Defina o funnel_id aqui:
DO $$
DECLARE
  v_funnel UUID := 'SEU_FUNNEL_ID_AQUI';
  v_moved  INT := 0;
  rec      RECORD;
BEGIN
  -- Para cada lead neste funil, buscar último evento com regra de transição
  FOR rec IN
    WITH last_event AS (
      SELECT DISTINCT ON (le.lead_id)
        le.lead_id,
        le.event_name
      FROM lead_events le
      WHERE le.funnel_id = v_funnel
      ORDER BY le.lead_id, le.created_at DESC
    ),
    matched_rule AS (
      SELECT
        le.lead_id,
        le.event_name,
        str.to_stage_id,
        str.value_classification
      FROM last_event le
      INNER JOIN stage_transition_rules str
        ON str.funnel_id = v_funnel
        AND str.event_name = le.event_name
    )
    SELECT
      lsp.id AS position_id,
      lsp.lead_id,
      lsp.stage_id AS current_stage_id,
      mr.to_stage_id,
      mr.value_classification,
      mr.event_name
    FROM lead_stage_positions lsp
    INNER JOIN matched_rule mr ON mr.lead_id = lsp.lead_id
    WHERE lsp.funnel_id = v_funnel
      AND lsp.stage_id <> mr.to_stage_id  -- só move se estiver em etapa diferente
  LOOP
    UPDATE lead_stage_positions
    SET stage_id = rec.to_stage_id,
        entered_at = NOW()
    WHERE id = rec.position_id;

    v_moved := v_moved + 1;
  END LOOP;

  RAISE NOTICE '✅ Reprocessamento concluído: % leads movidos', v_moved;
END;
$$;


-- ═══════════════════════════════════════════════════════════════════
-- PREVIEW (opcional): rode este SELECT antes para ver o que será movido
-- ═══════════════════════════════════════════════════════════════════
/*
WITH last_event AS (
  SELECT DISTINCT ON (le.lead_id)
    le.lead_id,
    le.event_name
  FROM lead_events le
  WHERE le.funnel_id = 'SEU_FUNNEL_ID_AQUI'
  ORDER BY le.lead_id, le.created_at DESC
),
matched_rule AS (
  SELECT
    le.lead_id,
    le.event_name,
    str.to_stage_id,
    str.value_classification
  FROM last_event le
  INNER JOIN stage_transition_rules str
    ON str.funnel_id = 'SEU_FUNNEL_ID_AQUI'
    AND str.event_name = le.event_name
)
SELECT
  l.name,
  l.email,
  mr.event_name AS ultimo_evento,
  current_stage.name AS etapa_atual,
  target_stage.name AS etapa_destino
FROM lead_stage_positions lsp
INNER JOIN matched_rule mr ON mr.lead_id = lsp.lead_id
INNER JOIN leads l ON l.id = lsp.lead_id
INNER JOIN lead_funnel_stages current_stage ON current_stage.id = lsp.stage_id
INNER JOIN lead_funnel_stages target_stage ON target_stage.id = mr.to_stage_id
WHERE lsp.funnel_id = 'SEU_FUNNEL_ID_AQUI'
  AND lsp.stage_id <> mr.to_stage_id;
*/
