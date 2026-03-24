-- ============================================================
-- RPC: sync_lead_from_sale
-- Centraliza a lógica de sincronização de leads que antes
-- estava duplicada em 5 Edge Functions.
--
-- Uso nas Edge Functions:
--   await supabase.rpc("sync_lead_from_sale", {
--     p_phone, p_email, p_name,
--     p_utm_source, p_utm_medium, p_utm_campaign,
--     p_utm_content, p_utm_term,
--     p_event_name, p_metadata
--   });
--
-- IMPORTANTE: Rodar este SQL no Supabase ANTES de deployar
-- as Edge Functions refatoradas.
-- ============================================================

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
  p_metadata     JSONB DEFAULT '{}'::JSONB
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id       UUID := '00000000-0000-0000-0000-000000000001';
  v_lead_id      UUID;
  v_funnel_id    UUID;
  v_stage_id     UUID;
  v_existing_pos UUID;
BEGIN
  -- Precisa de pelo menos email ou phone
  IF p_phone IS NULL AND p_email IS NULL THEN
    RETURN NULL;
  END IF;

  -- ─── 1. Dedup: buscar lead existente por phone, depois email ───
  IF p_phone IS NOT NULL THEN
    SELECT id INTO v_lead_id
    FROM leads
    WHERE organization_id = v_org_id AND phone = p_phone
    LIMIT 1;
  END IF;

  IF v_lead_id IS NULL AND p_email IS NOT NULL THEN
    SELECT id INTO v_lead_id
    FROM leads
    WHERE organization_id = v_org_id AND email = p_email
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
      updated_at  = NOW(),
      name        = COALESCE(leads.name, p_name),
      utm_source  = COALESCE(p_utm_source, leads.utm_source)
    WHERE id = v_lead_id;
  END IF;

  -- ─── 3. Find or create "BASE DE LEADS" funnel ───
  SELECT id INTO v_funnel_id
  FROM lead_funnels
  WHERE organization_id = v_org_id AND name = 'BASE DE LEADS'
  LIMIT 1;

  IF v_funnel_id IS NULL THEN
    INSERT INTO lead_funnels (organization_id, name, color, is_active)
    VALUES (v_org_id, 'BASE DE LEADS', '#6366f1', true)
    RETURNING id INTO v_funnel_id;

    -- Criar stages padrão
    INSERT INTO lead_funnel_stages (funnel_id, name, color, sort_order) VALUES
      (v_funnel_id, 'Novo',        '#94a3b8', 0),
      (v_funnel_id, 'Comprador',   '#22c55e', 1),
      (v_funnel_id, 'Recorrente',  '#3b82f6', 2),
      (v_funnel_id, 'VIP',         '#f59e0b', 3);
  END IF;

  -- ─── 4. Log lead_event ───
  INSERT INTO lead_events (lead_id, funnel_id, event_name, metadata)
  VALUES (v_lead_id, v_funnel_id, p_event_name, p_metadata);

  -- ─── 5. Posicionar no primeiro stage (se ainda não posicionado) ───
  SELECT id INTO v_existing_pos
  FROM lead_stage_positions
  WHERE lead_id = v_lead_id AND funnel_id = v_funnel_id
  LIMIT 1;

  IF v_existing_pos IS NULL THEN
    SELECT id INTO v_stage_id
    FROM lead_funnel_stages
    WHERE funnel_id = v_funnel_id
    ORDER BY sort_order ASC
    LIMIT 1;

    IF v_stage_id IS NOT NULL THEN
      INSERT INTO lead_stage_positions (lead_id, funnel_id, stage_id)
      VALUES (v_lead_id, v_funnel_id, v_stage_id);
    END IF;
  END IF;

  RETURN v_lead_id;
END;
$$;

-- Permitir chamada via supabase.rpc() por qualquer role autenticado ou service_role
GRANT EXECUTE ON FUNCTION public.sync_lead_from_sale TO authenticated;
GRANT EXECUTE ON FUNCTION public.sync_lead_from_sale TO service_role;

COMMENT ON FUNCTION public.sync_lead_from_sale IS
  'Centraliza dedup + criação de lead + posicionamento no funil BASE DE LEADS. Chamada por todos os webhooks e importadores.';
