-- ═══════════════════════════════════════════════════════════════════
-- PASSO 2: Reprocessar leads da BASE DE LEADS para RECOMPRA - POTES
--
-- Este script:
-- 1. Busca lead_events na BASE com product_name contendo 'articulabem'
-- 2. Posiciona cada lead no funil RECOMPRA - POTES (se ainda não estiver)
-- 3. Registra o evento no funil RECOMPRA
-- 4. Aplica stage_transition_rules para mover para a etapa correta
--
-- PREVIEW primeiro, depois rode o DO block.
-- ═══════════════════════════════════════════════════════════════════

-- ═══════════════════════════════════════════════════════════════════
-- PREVIEW: ver quantos leads serão afetados
-- ═══════════════════════════════════════════════════════════════════
/*
WITH base_events AS (
  SELECT DISTINCT ON (le.lead_id)
    le.lead_id,
    le.event_name,
    le.metadata->>'product_name' AS product_name,
    le.created_at
  FROM lead_events le
  WHERE le.funnel_id = '84bab083-75f7-4e0c-a120-9f20023e4c02'  -- BASE DE LEADS
    AND le.metadata->>'product_name' ILIKE '%articulabem%'
  ORDER BY le.lead_id, le.created_at DESC
)
SELECT
  l.name,
  l.email,
  be.event_name,
  be.product_name,
  CASE WHEN lsp.id IS NOT NULL THEN 'Já no funil' ELSE 'Será adicionado' END AS status
FROM base_events be
JOIN leads l ON l.id = be.lead_id
LEFT JOIN lead_stage_positions lsp
  ON lsp.lead_id = be.lead_id
  AND lsp.funnel_id = '19f75912-295e-4c67-acad-275ce6849c5c'
ORDER BY be.product_name, be.event_name;
*/

-- ═══════════════════════════════════════════════════════════════════
-- EXECUTAR: Reprocessar leads
-- ═══════════════════════════════════════════════════════════════════
DO $$
DECLARE
  v_recompra_funnel UUID := '19f75912-295e-4c67-acad-275ce6849c5c';
  v_base_funnel     UUID := '84bab083-75f7-4e0c-a120-9f20023e4c02';
  v_first_stage     UUID;
  v_target_stage    UUID;
  v_current_stage   UUID;
  v_added    INT := 0;
  v_moved    INT := 0;
  v_events   INT := 0;
  rec        RECORD;
BEGIN
  -- Primeiro stage do funil RECOMPRA (Base de clientes, sort_order=0)
  SELECT id INTO v_first_stage
  FROM lead_funnel_stages
  WHERE funnel_id = v_recompra_funnel
  ORDER BY sort_order ASC
  LIMIT 1;

  -- Para cada lead com evento articulabem na BASE, pegar o ÚLTIMO evento
  FOR rec IN
    SELECT DISTINCT ON (le.lead_id)
      le.lead_id,
      le.event_name,
      le.metadata,
      le.created_at
    FROM lead_events le
    WHERE le.funnel_id = v_base_funnel
      AND le.metadata->>'product_name' ILIKE '%articulabem%'
    ORDER BY le.lead_id, le.created_at DESC
  LOOP
    -- 1. Posicionar no funil RECOMPRA (se não existir)
    INSERT INTO lead_stage_positions (lead_id, funnel_id, stage_id)
    VALUES (rec.lead_id, v_recompra_funnel, v_first_stage)
    ON CONFLICT (lead_id, funnel_id) DO NOTHING;

    IF FOUND THEN
      v_added := v_added + 1;
    END IF;

    -- 2. Registrar evento no funil RECOMPRA
    INSERT INTO lead_events (lead_id, funnel_id, event_name, metadata, created_at)
    VALUES (rec.lead_id, v_recompra_funnel, rec.event_name, rec.metadata, rec.created_at);
    v_events := v_events + 1;

    -- 3. Aplicar stage_transition_rules
    SELECT stage_id INTO v_current_stage
    FROM lead_stage_positions
    WHERE lead_id = rec.lead_id AND funnel_id = v_recompra_funnel
    LIMIT 1;

    SELECT to_stage_id INTO v_target_stage
    FROM stage_transition_rules
    WHERE funnel_id = v_recompra_funnel
      AND event_name = rec.event_name
      AND (from_stage_id IS NULL OR from_stage_id = v_current_stage)
    ORDER BY (from_stage_id IS NOT NULL) DESC
    LIMIT 1;

    IF v_target_stage IS NOT NULL AND v_target_stage <> v_current_stage THEN
      UPDATE lead_stage_positions
      SET stage_id = v_target_stage, entered_at = NOW()
      WHERE lead_id = rec.lead_id AND funnel_id = v_recompra_funnel;
      v_moved := v_moved + 1;
    END IF;
  END LOOP;

  RAISE NOTICE '✅ Reprocessamento concluído:';
  RAISE NOTICE '   Leads adicionados ao funil: %', v_added;
  RAISE NOTICE '   Eventos registrados: %', v_events;
  RAISE NOTICE '   Leads movidos de etapa: %', v_moved;
END;
$$;
