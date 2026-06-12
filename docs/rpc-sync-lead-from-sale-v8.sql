-- ============================================================
-- RPC: sync_lead_from_sale (v8 — eco de transação antiga não move lead)
--
-- PROBLEMA (diagnosticado 2026-06-12 com dados de produção):
-- A Guru expira PIX/boleto não pagos na virada do dia e envia webhook
-- `expired` (normalizado para `canceled`) DIAS depois da tentativa real.
-- A RPC disparava as stage_transition_rules nesse eco e movia o lead
-- (ex.: para "Recuperar") com entered_at = NOW() — o lead reaparecia no
-- Kanban datado de hoje, "como se tivesse tentado comprar hoje", e a
-- equipe re-trabalhava leads já chamados. Caso real: 3 leads ArticulaBem
-- (tentativas de 04-05/06, expiradas na madrugada de 12/06).
--
-- CORREÇÃO (2 mudanças, mesma assinatura — zero downtime):
-- 1) GATE DE FRESCOR: regras de transição só disparam se a transação
--    (p_purchased_at) tiver até 48h. Eco de transação velha continua
--    registrado em lead_events (histórico/timeline), mas NÃO move o lead.
--    - PIX que expira no mesmo dia → continua indo para "Recuperar" ✓
--    - Boleto que expira em 7 dias → fica onde a equipe deixou ✓
--    - Reenvio/retry de webhook antigo → não mexe no quadro ✓
--    Callers sem p_purchased_at usam o DEFAULT now() → sempre "fresco"
--    (comportamento idêntico ao atual).
-- 2) original_date NO METADATA: todo lead_event ganha
--    metadata.original_date = p_purchased_at. A timeline do front
--    (LeadTimeline.getEventDate) já prioriza esse campo — eventos
--    processados com atraso passam a aparecer na data real da transação.
--
-- Existem DUAS sobrecargas em produção (12 e 13 parâmetros — a de 13 tem
-- p_funnel_id para webhook com token). As duas recebem a mesma correção.
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- Sobrecarga 1/2: SEM p_funnel_id (12 parâmetros)
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.sync_lead_from_sale(
  p_phone        TEXT DEFAULT NULL,
  p_email        TEXT DEFAULT NULL,
  p_name         TEXT DEFAULT NULL,
  p_utm_source   TEXT DEFAULT NULL,
  p_utm_medium   TEXT DEFAULT NULL,
  p_utm_campaign TEXT DEFAULT NULL,
  p_utm_content  TEXT DEFAULT NULL,
  p_utm_term     TEXT DEFAULT NULL,
  p_event_name   TEXT DEFAULT 'purchase',
  p_product_name TEXT DEFAULT NULL,
  p_purchased_at TIMESTAMPTZ DEFAULT NOW(),
  p_metadata     JSONB DEFAULT '{}'::JSONB
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id         UUID := '00000000-0000-0000-0000-000000000001';
  v_lead_id        UUID;
  v_base_funnel_id UUID;
  v_prod_funnel_id UUID;
  v_stage_id       UUID;
  v_existing_pos   UUID;
  v_current_stage  UUID;
  v_target_stage   UUID;
  -- v8: transação com mais de 48h é "eco" (expiração/reenvio) — não move lead
  v_fresh          BOOLEAN := COALESCE(p_purchased_at, NOW()) >= NOW() - INTERVAL '48 hours';
  v_meta           JSONB := p_metadata || jsonb_build_object('original_date', COALESCE(p_purchased_at, NOW()));
BEGIN
  IF p_phone IS NULL AND p_email IS NULL THEN
    RETURN NULL;
  END IF;

  -- 1. Dedup: buscar lead existente
  IF p_phone IS NOT NULL THEN
    SELECT id INTO v_lead_id
    FROM leads
    WHERE organization_id = v_org_id AND phone = p_phone
    LIMIT 1;
  END IF;

  IF v_lead_id IS NULL AND p_email IS NOT NULL THEN
    SELECT id INTO v_lead_id
    FROM leads
    WHERE organization_id = v_org_id AND LOWER(email) = LOWER(p_email)
    LIMIT 1;
  END IF;

  -- 2. Criar ou atualizar lead
  IF v_lead_id IS NULL THEN
    INSERT INTO leads (
      organization_id, phone, email, name,
      utm_source, utm_medium, utm_campaign, utm_content, utm_term,
      metadata
    ) VALUES (
      v_org_id,
      p_phone, p_email, p_name,
      p_utm_source, p_utm_medium, p_utm_campaign, p_utm_content, p_utm_term,
      '{}'::JSONB
    )
    RETURNING id INTO v_lead_id;
  ELSE
    UPDATE leads SET
      updated_at   = NOW(),
      name         = COALESCE(leads.name, p_name),
      utm_source   = COALESCE(p_utm_source, leads.utm_source),
      utm_medium   = COALESCE(p_utm_medium, leads.utm_medium),
      utm_campaign = COALESCE(p_utm_campaign, leads.utm_campaign),
      utm_content  = COALESCE(p_utm_content, leads.utm_content),
      utm_term     = COALESCE(p_utm_term, leads.utm_term)
    WHERE id = v_lead_id;
  END IF;

  -- 3. Find or create "BASE DE LEADS" funnel
  SELECT id INTO v_base_funnel_id
  FROM lead_funnels
  WHERE organization_id = v_org_id AND name = 'BASE DE LEADS'
  LIMIT 1;

  IF v_base_funnel_id IS NULL THEN
    INSERT INTO lead_funnels (organization_id, name, color, is_active)
    VALUES (v_org_id, 'BASE DE LEADS', '#6366f1', true)
    RETURNING id INTO v_base_funnel_id;

    INSERT INTO lead_funnel_stages (funnel_id, name, color, sort_order) VALUES
      (v_base_funnel_id, 'Novo',        '#94a3b8', 0),
      (v_base_funnel_id, 'Comprador',   '#22c55e', 1),
      (v_base_funnel_id, 'Recorrente',  '#3b82f6', 2),
      (v_base_funnel_id, 'VIP',         '#f59e0b', 3);
  END IF;

  -- 4. Log lead_event na BASE DE LEADS (idempotente por índice único)
  INSERT INTO lead_events (lead_id, funnel_id, event_name, metadata)
  VALUES (v_lead_id, v_base_funnel_id, p_event_name, v_meta)
  ON CONFLICT DO NOTHING;

  -- 5. Posicionar no primeiro stage da BASE (se ainda não posicionado)
  SELECT id INTO v_existing_pos
  FROM lead_stage_positions
  WHERE lead_id = v_lead_id AND funnel_id = v_base_funnel_id
  LIMIT 1;

  IF v_existing_pos IS NULL THEN
    SELECT id INTO v_stage_id
    FROM lead_funnel_stages
    WHERE funnel_id = v_base_funnel_id
    ORDER BY sort_order ASC
    LIMIT 1;

    IF v_stage_id IS NOT NULL THEN
      INSERT INTO lead_stage_positions (lead_id, funnel_id, stage_id)
      VALUES (v_lead_id, v_base_funnel_id, v_stage_id);
    END IF;
  END IF;

  -- 5b. Aplicar stage_transition_rules na BASE DE LEADS (v8: só se fresco)
  IF v_fresh THEN
    SELECT stage_id INTO v_current_stage
    FROM lead_stage_positions
    WHERE lead_id = v_lead_id AND funnel_id = v_base_funnel_id
    LIMIT 1;

    IF v_current_stage IS NOT NULL THEN
      SELECT to_stage_id INTO v_target_stage
      FROM stage_transition_rules
      WHERE funnel_id = v_base_funnel_id
        AND event_name = p_event_name
        AND (from_stage_id IS NULL OR from_stage_id = v_current_stage)
      ORDER BY (from_stage_id IS NOT NULL) DESC
      LIMIT 1;

      IF v_target_stage IS NOT NULL AND v_target_stage <> v_current_stage THEN
        UPDATE lead_stage_positions
        SET stage_id = v_target_stage, entered_at = NOW()
        WHERE lead_id = v_lead_id AND funnel_id = v_base_funnel_id;
      END IF;
    END IF;
  END IF;

  -- 6. Posicionar em TODOS os funis do PRODUTO (multi-funnel)
  IF p_product_name IS NOT NULL AND p_product_name <> '' THEN
    FOR v_prod_funnel_id IN
      SELECT DISTINCT lf.id
      FROM lead_product_mappings lpm
      JOIN lead_funnels lf ON lf.id = lpm.lead_funnel_id
      WHERE lf.organization_id = v_org_id
        AND LOWER(lpm.raw_product_name) = LOWER(p_product_name)
        AND lf.is_active = true

      UNION

      SELECT DISTINCT lfp.lead_funnel_id
      FROM lead_funnel_products lfp
      JOIN lead_funnels lf ON lf.id = lfp.lead_funnel_id
      WHERE lf.organization_id = v_org_id
        AND p_product_name ILIKE '%' || lfp.product_name_contains || '%'
        AND lf.is_active = true
    LOOP
      IF v_prod_funnel_id = v_base_funnel_id THEN
        CONTINUE;
      END IF;

      -- Log event no funil do produto (idempotente)
      INSERT INTO lead_events (lead_id, funnel_id, event_name, metadata)
      VALUES (v_lead_id, v_prod_funnel_id, p_event_name, v_meta)
      ON CONFLICT DO NOTHING;

      -- Posicionar no primeiro stage do funil
      SELECT id INTO v_stage_id
      FROM lead_funnel_stages
      WHERE funnel_id = v_prod_funnel_id
      ORDER BY sort_order ASC
      LIMIT 1;

      IF v_stage_id IS NOT NULL THEN
        INSERT INTO lead_stage_positions (lead_id, funnel_id, stage_id)
        VALUES (v_lead_id, v_prod_funnel_id, v_stage_id)
        ON CONFLICT (lead_id, funnel_id) DO NOTHING;
      END IF;

      -- 6b. Aplicar stage_transition_rules no funil do produto (v8: só se fresco)
      IF v_fresh THEN
        SELECT stage_id INTO v_current_stage
        FROM lead_stage_positions
        WHERE lead_id = v_lead_id AND funnel_id = v_prod_funnel_id
        LIMIT 1;

        IF v_current_stage IS NOT NULL THEN
          SELECT to_stage_id INTO v_target_stage
          FROM stage_transition_rules
          WHERE funnel_id = v_prod_funnel_id
            AND event_name = p_event_name
            AND (from_stage_id IS NULL OR from_stage_id = v_current_stage)
          ORDER BY (from_stage_id IS NOT NULL) DESC
          LIMIT 1;

          IF v_target_stage IS NOT NULL AND v_target_stage <> v_current_stage THEN
            UPDATE lead_stage_positions
            SET stage_id = v_target_stage, entered_at = NOW()
            WHERE lead_id = v_lead_id AND funnel_id = v_prod_funnel_id;
          END IF;
        END IF;
      END IF;
    END LOOP;
  END IF;

  RETURN v_lead_id;
END;
$$;

-- ────────────────────────────────────────────────────────────
-- Sobrecarga 2/2: COM p_funnel_id (13 parâmetros — webhook com token)
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.sync_lead_from_sale(
  p_phone        TEXT DEFAULT NULL,
  p_email        TEXT DEFAULT NULL,
  p_name         TEXT DEFAULT NULL,
  p_utm_source   TEXT DEFAULT NULL,
  p_utm_medium   TEXT DEFAULT NULL,
  p_utm_campaign TEXT DEFAULT NULL,
  p_utm_content  TEXT DEFAULT NULL,
  p_utm_term     TEXT DEFAULT NULL,
  p_event_name   TEXT DEFAULT 'purchase',
  p_product_name TEXT DEFAULT NULL,
  p_purchased_at TIMESTAMPTZ DEFAULT NOW(),
  p_metadata     JSONB DEFAULT '{}'::JSONB,
  p_funnel_id    UUID DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id         UUID := '00000000-0000-0000-0000-000000000001';
  v_lead_id        UUID;
  v_base_funnel_id UUID;
  v_prod_funnel_id UUID;
  v_stage_id       UUID;
  v_existing_pos   UUID;
  v_current_stage  UUID;
  v_target_stage   UUID;
  v_token_valid    BOOLEAN := false;
  -- v8: transação com mais de 48h é "eco" (expiração/reenvio) — não move lead
  v_fresh          BOOLEAN := COALESCE(p_purchased_at, NOW()) >= NOW() - INTERVAL '48 hours';
  v_meta           JSONB := p_metadata || jsonb_build_object('original_date', COALESCE(p_purchased_at, NOW()));
BEGIN
  IF p_phone IS NULL AND p_email IS NULL THEN
    RETURN NULL;
  END IF;

  -- 1. Dedup: buscar lead existente
  IF p_phone IS NOT NULL THEN
    SELECT id INTO v_lead_id
    FROM leads
    WHERE organization_id = v_org_id AND phone = p_phone
    LIMIT 1;
  END IF;

  IF v_lead_id IS NULL AND p_email IS NOT NULL THEN
    SELECT id INTO v_lead_id
    FROM leads
    WHERE organization_id = v_org_id AND LOWER(email) = LOWER(p_email)
    LIMIT 1;
  END IF;

  -- 2. Criar ou atualizar lead
  IF v_lead_id IS NULL THEN
    INSERT INTO leads (
      organization_id, phone, email, name,
      utm_source, utm_medium, utm_campaign, utm_content, utm_term,
      metadata
    ) VALUES (
      v_org_id,
      p_phone, p_email, p_name,
      p_utm_source, p_utm_medium, p_utm_campaign, p_utm_content, p_utm_term,
      '{}'::JSONB
    )
    RETURNING id INTO v_lead_id;
  ELSE
    UPDATE leads SET
      updated_at   = NOW(),
      name         = COALESCE(leads.name, p_name),
      utm_source   = COALESCE(p_utm_source, leads.utm_source),
      utm_medium   = COALESCE(p_utm_medium, leads.utm_medium),
      utm_campaign = COALESCE(p_utm_campaign, leads.utm_campaign),
      utm_content  = COALESCE(p_utm_content, leads.utm_content),
      utm_term     = COALESCE(p_utm_term, leads.utm_term)
    WHERE id = v_lead_id;
  END IF;

  -- 3. Find or create "BASE DE LEADS" funnel
  SELECT id INTO v_base_funnel_id
  FROM lead_funnels
  WHERE organization_id = v_org_id AND name = 'BASE DE LEADS'
  LIMIT 1;

  IF v_base_funnel_id IS NULL THEN
    INSERT INTO lead_funnels (organization_id, name, color, is_active)
    VALUES (v_org_id, 'BASE DE LEADS', '#6366f1', true)
    RETURNING id INTO v_base_funnel_id;

    INSERT INTO lead_funnel_stages (funnel_id, name, color, sort_order) VALUES
      (v_base_funnel_id, 'Novo',        '#94a3b8', 0),
      (v_base_funnel_id, 'Comprador',   '#22c55e', 1),
      (v_base_funnel_id, 'Recorrente',  '#3b82f6', 2),
      (v_base_funnel_id, 'VIP',         '#f59e0b', 3);
  END IF;

  -- 4. Log lead_event na BASE DE LEADS (idempotente)
  INSERT INTO lead_events (lead_id, funnel_id, event_name, metadata)
  VALUES (v_lead_id, v_base_funnel_id, p_event_name, v_meta)
  ON CONFLICT DO NOTHING;

  -- 5. Posicionar no primeiro stage da BASE
  SELECT id INTO v_existing_pos
  FROM lead_stage_positions
  WHERE lead_id = v_lead_id AND funnel_id = v_base_funnel_id
  LIMIT 1;

  IF v_existing_pos IS NULL THEN
    SELECT id INTO v_stage_id
    FROM lead_funnel_stages
    WHERE funnel_id = v_base_funnel_id
    ORDER BY sort_order ASC
    LIMIT 1;

    IF v_stage_id IS NOT NULL THEN
      INSERT INTO lead_stage_positions (lead_id, funnel_id, stage_id)
      VALUES (v_lead_id, v_base_funnel_id, v_stage_id);
    END IF;
  END IF;

  -- 5b. stage_transition_rules na BASE DE LEADS (v8: só se fresco)
  IF v_fresh THEN
    SELECT stage_id INTO v_current_stage
    FROM lead_stage_positions
    WHERE lead_id = v_lead_id AND funnel_id = v_base_funnel_id
    LIMIT 1;

    IF v_current_stage IS NOT NULL THEN
      SELECT to_stage_id INTO v_target_stage
      FROM stage_transition_rules
      WHERE funnel_id = v_base_funnel_id
        AND event_name = p_event_name
        AND (from_stage_id IS NULL OR from_stage_id = v_current_stage)
      ORDER BY (from_stage_id IS NOT NULL) DESC
      LIMIT 1;

      IF v_target_stage IS NOT NULL AND v_target_stage <> v_current_stage THEN
        UPDATE lead_stage_positions
        SET stage_id = v_target_stage, entered_at = NOW()
        WHERE lead_id = v_lead_id AND funnel_id = v_base_funnel_id;
      END IF;
    END IF;
  END IF;

  -- 6.PRE — Se veio funnel_id explícito (token webhook), valida e força inclusão
  IF p_funnel_id IS NOT NULL THEN
    SELECT EXISTS(
      SELECT 1 FROM lead_funnels
      WHERE id = p_funnel_id
        AND organization_id = v_org_id
        AND is_active = true
    ) INTO v_token_valid;

    IF v_token_valid AND p_funnel_id <> v_base_funnel_id THEN
      -- Log event
      INSERT INTO lead_events (lead_id, funnel_id, event_name, metadata)
      VALUES (v_lead_id, p_funnel_id, p_event_name, v_meta)
      ON CONFLICT DO NOTHING;

      -- Posicionar no primeiro stage
      SELECT id INTO v_stage_id
      FROM lead_funnel_stages
      WHERE funnel_id = p_funnel_id
      ORDER BY sort_order ASC
      LIMIT 1;

      IF v_stage_id IS NOT NULL THEN
        INSERT INTO lead_stage_positions (lead_id, funnel_id, stage_id)
        VALUES (v_lead_id, p_funnel_id, v_stage_id)
        ON CONFLICT (lead_id, funnel_id) DO NOTHING;
      END IF;

      -- Aplicar stage_transition_rules (v8: só se fresco)
      IF v_fresh THEN
        SELECT stage_id INTO v_current_stage
        FROM lead_stage_positions
        WHERE lead_id = v_lead_id AND funnel_id = p_funnel_id
        LIMIT 1;

        IF v_current_stage IS NOT NULL THEN
          SELECT to_stage_id INTO v_target_stage
          FROM stage_transition_rules
          WHERE funnel_id = p_funnel_id
            AND event_name = p_event_name
            AND (from_stage_id IS NULL OR from_stage_id = v_current_stage)
          ORDER BY (from_stage_id IS NOT NULL) DESC
          LIMIT 1;

          IF v_target_stage IS NOT NULL AND v_target_stage <> v_current_stage THEN
            UPDATE lead_stage_positions
            SET stage_id = v_target_stage, entered_at = NOW()
            WHERE lead_id = v_lead_id AND funnel_id = p_funnel_id;
          END IF;
        END IF;
      END IF;
    END IF;
  END IF;

  -- 6. Posicionar em TODOS os funis do PRODUTO (multi-funnel)
  IF p_product_name IS NOT NULL AND p_product_name <> '' THEN
    FOR v_prod_funnel_id IN
      SELECT DISTINCT lf.id
      FROM lead_product_mappings lpm
      JOIN lead_funnels lf ON lf.id = lpm.lead_funnel_id
      WHERE lf.organization_id = v_org_id
        AND LOWER(lpm.raw_product_name) = LOWER(p_product_name)
        AND lf.is_active = true
      UNION
      SELECT DISTINCT lfp.lead_funnel_id
      FROM lead_funnel_products lfp
      JOIN lead_funnels lf ON lf.id = lfp.lead_funnel_id
      WHERE lf.organization_id = v_org_id
        AND p_product_name ILIKE '%' || lfp.product_name_contains || '%'
        AND lf.is_active = true
    LOOP
      IF v_prod_funnel_id = v_base_funnel_id OR v_prod_funnel_id = p_funnel_id THEN
        CONTINUE;
      END IF;

      INSERT INTO lead_events (lead_id, funnel_id, event_name, metadata)
      VALUES (v_lead_id, v_prod_funnel_id, p_event_name, v_meta)
      ON CONFLICT DO NOTHING;

      SELECT id INTO v_stage_id
      FROM lead_funnel_stages
      WHERE funnel_id = v_prod_funnel_id
      ORDER BY sort_order ASC
      LIMIT 1;

      IF v_stage_id IS NOT NULL THEN
        INSERT INTO lead_stage_positions (lead_id, funnel_id, stage_id)
        VALUES (v_lead_id, v_prod_funnel_id, v_stage_id)
        ON CONFLICT (lead_id, funnel_id) DO NOTHING;
      END IF;

      -- 6b. stage_transition_rules no funil do produto (v8: só se fresco)
      IF v_fresh THEN
        SELECT stage_id INTO v_current_stage
        FROM lead_stage_positions
        WHERE lead_id = v_lead_id AND funnel_id = v_prod_funnel_id
        LIMIT 1;

        IF v_current_stage IS NOT NULL THEN
          SELECT to_stage_id INTO v_target_stage
          FROM stage_transition_rules
          WHERE funnel_id = v_prod_funnel_id
            AND event_name = p_event_name
            AND (from_stage_id IS NULL OR from_stage_id = v_current_stage)
          ORDER BY (from_stage_id IS NOT NULL) DESC
          LIMIT 1;

          IF v_target_stage IS NOT NULL AND v_target_stage <> v_current_stage THEN
            UPDATE lead_stage_positions
            SET stage_id = v_target_stage, entered_at = NOW()
            WHERE lead_id = v_lead_id AND funnel_id = v_prod_funnel_id;
          END IF;
        END IF;
      END IF;
    END LOOP;
  END IF;

  RETURN v_lead_id;
END;
$$;

COMMENT ON FUNCTION public.sync_lead_from_sale(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TIMESTAMPTZ, JSONB) IS
  'v8: eco de transação antiga (>48h, ex.: boleto expirado pela Guru dias depois) não dispara transição de etapa — evento fica só no histórico. metadata.original_date = data real da transação.';
COMMENT ON FUNCTION public.sync_lead_from_sale(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TIMESTAMPTZ, JSONB, UUID) IS
  'v8: idem, sobrecarga com p_funnel_id (webhook com token de funil).';

-- ────────────────────────────────────────────────────────────
-- Correção pontual (aplicada 2026-06-12): os 3 leads ArticulaBem movidos
-- pelo eco de expiração na madrugada de 12/06 tiveram entered_at corrigido
-- para a data da tentativa real (ficam em "Recuperar", mas com data honesta):
--   Francisco Cardoso Leite  → 2026-06-04 14:39:59+00 (boleto ch_ZKe65Oaidc99NPOB)
--   Mayda Josefina C. Freire → 2026-06-04 19:02:24+00 (PIX ch_x1myGO2sOIywRnzo)
--   Maria Ligia Ferreira     → 2026-06-05 20:47:24+00 (boleto ch_qxl9KEXC3ECNeMwW)
-- ────────────────────────────────────────────────────────────
