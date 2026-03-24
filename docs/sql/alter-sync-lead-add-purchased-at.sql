-- ═══════════════════════════════════════════════════════════════════
-- ALTER RPC: sync_lead_from_sale — adiciona p_purchased_at
-- Usar data real da compra como created_at dos lead_events
--
-- Rodar no SQL Editor do Supabase Dashboard
-- ═══════════════════════════════════════════════════════════════════

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
  p_metadata     JSONB DEFAULT '{}'::JSONB,
  p_purchased_at TIMESTAMPTZ DEFAULT NULL          -- ← NOVO
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
  v_event_ts       TIMESTAMPTZ := COALESCE(p_purchased_at, now());
  v_enriched_meta  JSONB;
BEGIN
  -- Precisa de pelo menos email ou phone
  IF p_phone IS NULL AND p_email IS NULL THEN
    RETURN NULL;
  END IF;

  -- Enriquecer metadata com original_date para o frontend
  v_enriched_meta := p_metadata || jsonb_build_object('original_date', v_event_ts);

  -- ─── 1. Dedup/Upsert lead ───
  IF p_email IS NOT NULL THEN
    SELECT id INTO v_lead_id
    FROM leads
    WHERE organization_id = v_org_id AND LOWER(email) = LOWER(p_email)
    LIMIT 1;
  END IF;

  IF v_lead_id IS NULL AND p_phone IS NOT NULL THEN
    SELECT id INTO v_lead_id
    FROM leads
    WHERE organization_id = v_org_id AND phone = p_phone
    LIMIT 1;
  END IF;

  IF v_lead_id IS NULL THEN
    INSERT INTO leads (organization_id, email, phone, name, utm_source, utm_medium, utm_campaign, utm_content, utm_term)
    VALUES (v_org_id, p_email, p_phone, p_name, p_utm_source, p_utm_medium, p_utm_campaign, p_utm_content, p_utm_term)
    RETURNING id INTO v_lead_id;
  ELSE
    UPDATE leads SET
      name = COALESCE(leads.name, p_name),
      utm_source = COALESCE(leads.utm_source, p_utm_source),
      utm_medium = COALESCE(leads.utm_medium, p_utm_medium),
      utm_campaign = COALESCE(leads.utm_campaign, p_utm_campaign),
      utm_content = COALESCE(leads.utm_content, p_utm_content),
      utm_term = COALESCE(leads.utm_term, p_utm_term),
      updated_at = now()
    WHERE id = v_lead_id;
  END IF;

  -- ─── 2. Resolver funil BASE DE LEADS ───
  SELECT id INTO v_base_funnel_id
  FROM lead_funnels
  WHERE organization_id = v_org_id AND UPPER(name) = 'BASE DE LEADS' AND is_active = true
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

  -- ─── 4. Log lead_event na BASE DE LEADS (com data real) ───
  INSERT INTO lead_events (lead_id, funnel_id, event_name, metadata, created_at)
  VALUES (v_lead_id, v_base_funnel_id, p_event_name, v_enriched_meta, v_event_ts);

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

  -- ─── 6. Posicionar no funil do PRODUTO ───
  IF p_product_name IS NOT NULL AND p_product_name <> '' THEN
    SELECT lf.id INTO v_prod_funnel_id
    FROM lead_product_mappings lpm
    JOIN lead_funnels lf ON lf.id = lpm.lead_funnel_id
    WHERE lf.organization_id = v_org_id
      AND LOWER(lpm.raw_product_name) = LOWER(p_product_name)
      AND lf.is_active = true
    LIMIT 1;

    IF v_prod_funnel_id IS NULL THEN
      SELECT lfp.lead_funnel_id INTO v_prod_funnel_id
      FROM lead_funnel_products lfp
      JOIN lead_funnels lf ON lf.id = lfp.lead_funnel_id
      WHERE lf.organization_id = v_org_id
        AND p_product_name ILIKE '%' || lfp.product_name_contains || '%'
        AND lf.is_active = true
      ORDER BY length(lfp.product_name_contains) DESC
      LIMIT 1;
    END IF;

    IF v_prod_funnel_id IS NOT NULL AND v_prod_funnel_id <> v_base_funnel_id THEN
      INSERT INTO lead_events (lead_id, funnel_id, event_name, metadata, created_at)
      VALUES (v_lead_id, v_prod_funnel_id, p_event_name, v_enriched_meta, v_event_ts);

      SELECT id INTO v_existing_pos
      FROM lead_stage_positions
      WHERE lead_id = v_lead_id AND funnel_id = v_prod_funnel_id
      LIMIT 1;

      IF v_existing_pos IS NULL THEN
        SELECT id INTO v_stage_id
        FROM lead_funnel_stages
        WHERE funnel_id = v_prod_funnel_id
        ORDER BY sort_order ASC
        LIMIT 1;

        IF v_stage_id IS NOT NULL THEN
          INSERT INTO lead_stage_positions (lead_id, funnel_id, stage_id)
          VALUES (v_lead_id, v_prod_funnel_id, v_stage_id);
        END IF;
      END IF;
    END IF;
  END IF;

  -- ─── 7. Auto-mover para "Comprador" se evento = purchase ───
  IF p_event_name IN ('purchase', 'pago', 'authorized') THEN
    SELECT id INTO v_stage_id
    FROM lead_funnel_stages
    WHERE funnel_id = v_base_funnel_id AND LOWER(name) = 'comprador'
    LIMIT 1;

    IF v_stage_id IS NOT NULL THEN
      UPDATE lead_stage_positions
      SET stage_id = v_stage_id, entered_at = now()
      WHERE lead_id = v_lead_id AND funnel_id = v_base_funnel_id;
    END IF;
  END IF;

  RETURN v_lead_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.sync_lead_from_sale TO authenticated;
GRANT EXECUTE ON FUNCTION public.sync_lead_from_sale TO service_role;

COMMENT ON FUNCTION public.sync_lead_from_sale IS
  'v4: Adiciona p_purchased_at para usar data real da compra como created_at dos lead_events (ao invés de now()). Enriquece metadata com original_date para o frontend.';
