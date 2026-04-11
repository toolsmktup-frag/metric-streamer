-- ============================================================
-- BACKFILL: Reprocessar lead_events históricos e aplicar
-- stage_transition_rules retroativamente.
--
-- Rodar APÓS deploy da RPC v5 e APÓS configurar as regras
-- de transição no painel do funil.
--
-- Este script NÃO cria leads — apenas move leads que já
-- existem e têm eventos registrados para as etapas corretas.
-- ============================================================

DO $$
DECLARE
  rec RECORD;
  v_current_stage UUID;
  v_target_stage  UUID;
  v_moved         INT := 0;
BEGIN
  -- Iterar sobre lead_events dos últimos 30 dias que têm regras configuradas
  FOR rec IN
    SELECT DISTINCT ON (le.lead_id, le.funnel_id)
      le.lead_id,
      le.funnel_id,
      le.event_name,
      le.created_at
    FROM lead_events le
    INNER JOIN stage_transition_rules str
      ON str.funnel_id = le.funnel_id
      AND str.event_name = le.event_name
    WHERE le.created_at >= NOW() - INTERVAL '30 days'
    ORDER BY le.lead_id, le.funnel_id, le.created_at DESC
  LOOP
    -- Verificar posição atual
    SELECT stage_id INTO v_current_stage
    FROM lead_stage_positions
    WHERE lead_id = rec.lead_id AND funnel_id = rec.funnel_id
    LIMIT 1;

    -- Se não tem posição, pular (lead não está neste funil)
    IF v_current_stage IS NULL THEN
      CONTINUE;
    END IF;

    -- Buscar regra de transição aplicável
    SELECT to_stage_id INTO v_target_stage
    FROM stage_transition_rules
    WHERE funnel_id = rec.funnel_id
      AND event_name = rec.event_name
      AND (from_stage_id IS NULL OR from_stage_id = v_current_stage)
    ORDER BY (from_stage_id IS NOT NULL) DESC
    LIMIT 1;

    -- Mover se necessário
    IF v_target_stage IS NOT NULL AND v_target_stage <> v_current_stage THEN
      UPDATE lead_stage_positions
      SET stage_id = v_target_stage, entered_at = NOW()
      WHERE lead_id = rec.lead_id AND funnel_id = rec.funnel_id;

      v_moved := v_moved + 1;
    END IF;
  END LOOP;

  RAISE NOTICE 'Backfill concluído: % leads movidos para etapas corretas', v_moved;
END;
$$;
