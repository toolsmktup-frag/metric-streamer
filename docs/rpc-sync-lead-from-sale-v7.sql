-- ============================================================
-- RPC: sync_lead_from_sale (v7 — deduplicação race-safe)
--
-- Corrige 2 causas das duplicatas em lead_events:
-- 1) Cria um UNIQUE INDEX parcial por lead + funnel + event_name + transaction_id
-- 2) Troca IF NOT EXISTS por INSERT ... ON CONFLICT DO NOTHING
--
-- Resultado:
-- - Webhooks repetidos para a mesma transação não criam duplicatas
-- - Chamadas concorrentes (ex.: webhook + wz-receiver) ficam idempotentes
-- - Eventos sem transaction_id continuam permitidos por compatibilidade
-- ============================================================

-- 1) Barreira no banco contra eventos duplicados com transaction_id
CREATE UNIQUE INDEX IF NOT EXISTS ux_lead_events_txn_dedup
  ON public.lead_events (
    lead_id,
    funnel_id,
    event_name,
    ((metadata->>'transaction_id'))
  )
  WHERE metadata ? 'transaction_id'
    AND COALESCE(metadata->>'transaction_id', '') <> '';

-- 2) Recriar RPC com inserts idempotentes
DROP FUNCTION IF EXISTS public.sync_lead_from_sale(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, JSONB);
DROP FUNCTION IF EXISTS public.sync_lead_from_sale(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, JSONB);
DROP FUNCTION IF EXISTS public.sync_lead_from_sale(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TIMESTAMPTZ, JSONB);

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
BEGIN
  IF p_phone IS NULL AND p_email IS NULL THEN
    RETURN NULL;
  END IF;

  -- ─── 1. Dedup case-insensitive: buscar lead existente ───
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

  -- ─── 2. Criar ou atualizar lead ───
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

  -- ─── 3. Find or create "BASE DE LEADS" funnel ───
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

  -- ─── 4. Log lead_event na BASE DE LEADS (idempotente por índice único) ───
  INSERT INTO lead_events (lead_id, funnel_id, event_name, metadata)
  VALUES (v_lead_id, v_base_funnel_id, p_event_name, p_metadata)
  ON CONFLICT DO NOTHING;

  -- ─── 5. Posicionar no primeiro stage da BASE (se ainda não posicionado) ───
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

  -- ─── 5b. Aplicar stage_transition_rules na BASE DE LEADS ───
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

  -- ─── 6. Posicionar em TODOS os funis do PRODUTO (multi-funnel) ───
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

      -- Log event no funil do produto (idempotente por índice único)
      INSERT INTO lead_events (lead_id, funnel_id, event_name, metadata)
      VALUES (v_lead_id, v_prod_funnel_id, p_event_name, p_metadata)
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

      -- ─── 6b. Aplicar stage_transition_rules no funil do produto ───
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
    END LOOP;
  END IF;

  RETURN v_lead_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.sync_lead_from_sale TO authenticated;
GRANT EXECUTE ON FUNCTION public.sync_lead_from_sale TO service_role;

COMMENT ON FUNCTION public.sync_lead_from_sale IS
  'v7: deduplicação race-safe de lead_events via índice único parcial + ON CONFLICT DO NOTHING. Compatível com chamadas do webhook e do wz-receiver.';

-- 3) Opcional: limpar duplicatas já criadas por transaction_id
WITH ranked AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY lead_id, funnel_id, event_name, metadata->>'transaction_id'
      ORDER BY created_at ASC, id ASC
    ) AS rn
  FROM public.lead_events
  WHERE metadata ? 'transaction_id'
    AND COALESCE(metadata->>'transaction_id', '') <> ''
)
DELETE FROM public.lead_events le
USING ranked r
WHERE le.id = r.id
  AND r.rn > 1;
