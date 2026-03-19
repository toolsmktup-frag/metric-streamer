-- ═══════════════════════════════════════════════════════════════════
-- Stored Procedure: sync_leads_from_sales
-- Executa toda a lógica de sync direto no PostgreSQL (sem overhead de rede)
-- Deve ser executada manualmente no SQL Editor do Supabase Dashboard
-- ═══════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.sync_leads_from_sales(p_log_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_org_id uuid;
    v_funnel_id uuid;
    v_stage_comprador uuid;
    v_stage_perdido uuid;
    v_stage_novo uuid;
    v_lead_count integer := 0;
    v_event_count integer := 0;
    v_position_count integer := 0;
BEGIN
    -- ═══════════════════════════════════════════════════════════════
    -- STEP 0: Detect organization_id
    -- ═══════════════════════════════════════════════════════════════
    SELECT organization_id INTO v_org_id
    FROM unified_customers
    LIMIT 1;

    IF v_org_id IS NULL THEN
        UPDATE meta_sync_log SET
            status = 'failed',
            error = 'No organization found in unified_customers',
            finished_at = now(),
            records_synced = 0
        WHERE id = p_log_id;
        RETURN 0;
    END IF;

    -- ═══════════════════════════════════════════════════════════════
    -- STEP 1: Clean existing leads data for this org
    -- ═══════════════════════════════════════════════════════════════
    DELETE FROM lead_events
    WHERE lead_id IN (SELECT id FROM leads WHERE organization_id = v_org_id);

    DELETE FROM lead_stage_positions
    WHERE lead_id IN (SELECT id FROM leads WHERE organization_id = v_org_id);

    DELETE FROM leads WHERE organization_id = v_org_id;

    -- ═══════════════════════════════════════════════════════════════
    -- STEP 2: Ensure "BASE DE LEADS" funnel exists with stages
    -- ═══════════════════════════════════════════════════════════════
    SELECT id INTO v_funnel_id
    FROM lead_funnels
    WHERE organization_id = v_org_id AND name = 'BASE DE LEADS'
    LIMIT 1;

    IF v_funnel_id IS NULL THEN
        INSERT INTO lead_funnels (organization_id, name, color, is_active)
        VALUES (v_org_id, 'BASE DE LEADS', '#6366f1', true)
        RETURNING id INTO v_funnel_id;
    END IF;

    -- Ensure stages exist
    IF NOT EXISTS (SELECT 1 FROM lead_funnel_stages WHERE funnel_id = v_funnel_id) THEN
        INSERT INTO lead_funnel_stages (funnel_id, name, color, sort_order) VALUES
            (v_funnel_id, 'Novo',       '#94a3b8', 0),
            (v_funnel_id, 'Comprador',  '#22c55e', 1),
            (v_funnel_id, 'Perdido',    '#ef4444', 2),
            (v_funnel_id, 'Recorrente', '#3b82f6', 3),
            (v_funnel_id, 'VIP',        '#f59e0b', 4);
    ELSE
        -- Ensure "Perdido" stage exists
        IF NOT EXISTS (SELECT 1 FROM lead_funnel_stages WHERE funnel_id = v_funnel_id AND name = 'Perdido') THEN
            INSERT INTO lead_funnel_stages (funnel_id, name, color, sort_order)
            VALUES (v_funnel_id, 'Perdido', '#ef4444',
                    COALESCE((SELECT MAX(sort_order) + 1 FROM lead_funnel_stages WHERE funnel_id = v_funnel_id), 0));
        END IF;
    END IF;

    -- Get stage IDs
    SELECT id INTO v_stage_comprador FROM lead_funnel_stages WHERE funnel_id = v_funnel_id AND name = 'Comprador';
    SELECT id INTO v_stage_perdido   FROM lead_funnel_stages WHERE funnel_id = v_funnel_id AND name = 'Perdido';
    SELECT id INTO v_stage_novo      FROM lead_funnel_stages WHERE funnel_id = v_funnel_id AND name = 'Novo';

    -- ═══════════════════════════════════════════════════════════════
    -- STEP 3: Insert leads from unified_customers that have purchases
    -- ═══════════════════════════════════════════════════════════════
    INSERT INTO leads (organization_id, phone, email, name, utm_source, metadata)
    SELECT DISTINCT ON (uc.id)
        v_org_id,
        CASE WHEN uc.primary_phone IS NOT NULL AND length(regexp_replace(uc.primary_phone, '\D', '', 'g')) >= 8
             THEN regexp_replace(uc.primary_phone, '\D', '', 'g')
             ELSE NULL END,
        CASE WHEN uc.primary_email IS NOT NULL AND uc.primary_email LIKE '%@%'
             THEN lower(trim(uc.primary_email))
             ELSE NULL END,
        uc.full_name,
        cp_first.utm_source,
        '{}'::jsonb
    FROM unified_customers uc
    INNER JOIN customer_purchases cp_any ON cp_any.unified_customer_id = uc.id
    LEFT JOIN LATERAL (
        SELECT cp.utm_source
        FROM customer_purchases cp
        WHERE cp.unified_customer_id = uc.id
        ORDER BY cp.purchased_at ASC
        LIMIT 1
    ) cp_first ON true
    WHERE uc.organization_id = v_org_id
      AND (
        (uc.primary_phone IS NOT NULL AND length(regexp_replace(uc.primary_phone, '\D', '', 'g')) >= 8)
        OR
        (uc.primary_email IS NOT NULL AND uc.primary_email LIKE '%@%')
      );

    GET DIAGNOSTICS v_lead_count = ROW_COUNT;

    -- ═══════════════════════════════════════════════════════════════
    -- STEP 4: Create a temp mapping table for customer_id -> lead_id
    -- ═══════════════════════════════════════════════════════════════
    CREATE TEMP TABLE _lead_map AS
    SELECT l.id AS lead_id, uc.id AS unified_customer_id
    FROM leads l
    JOIN unified_customers uc ON
        l.organization_id = v_org_id
        AND uc.organization_id = v_org_id
        AND (
            (l.email IS NOT NULL AND lower(trim(uc.primary_email)) = l.email)
            OR (l.phone IS NOT NULL AND regexp_replace(uc.primary_phone, '\D', '', 'g') = l.phone)
        );

    CREATE INDEX ON _lead_map (unified_customer_id);

    -- ═══════════════════════════════════════════════════════════════
    -- STEP 5: Position leads in stages (Comprador vs Perdido)
    -- ═══════════════════════════════════════════════════════════════
    INSERT INTO lead_stage_positions (lead_id, funnel_id, stage_id, entered_at)
    SELECT DISTINCT ON (lm.lead_id)
        lm.lead_id,
        v_funnel_id,
        CASE WHEN EXISTS (
            SELECT 1 FROM customer_purchases cp2
            WHERE cp2.unified_customer_id = lm.unified_customer_id
            AND lower(cp2.status) IN ('authorized', 'approved', 'paid', 'completed', 'aprovada')
        ) THEN COALESCE(v_stage_comprador, v_stage_novo)
          ELSE COALESCE(v_stage_perdido, v_stage_novo)
        END,
        COALESCE(
            (SELECT MIN(cp3.purchased_at) FROM customer_purchases cp3
             WHERE cp3.unified_customer_id = lm.unified_customer_id),
            now()
        )
    FROM _lead_map lm;

    GET DIAGNOSTICS v_position_count = ROW_COUNT;

    -- ═══════════════════════════════════════════════════════════════
    -- STEP 6: Insert lead events from customer_purchases
    -- ═══════════════════════════════════════════════════════════════

    -- 6a: lead_importado event (one per lead)
    INSERT INTO lead_events (lead_id, funnel_id, event_name, metadata, created_at)
    SELECT DISTINCT ON (lm.lead_id)
        lm.lead_id,
        v_funnel_id,
        'lead_importado',
        '{"source": "sync"}'::jsonb,
        COALESCE(
            (SELECT MIN(cp4.purchased_at) FROM customer_purchases cp4
             WHERE cp4.unified_customer_id = lm.unified_customer_id),
            now()
        )
    FROM _lead_map lm;

    -- 6b: purchase events
    INSERT INTO lead_events (lead_id, funnel_id, event_name, metadata, created_at)
    SELECT
        lm.lead_id,
        v_funnel_id,
        CASE
            WHEN lower(cp.status) IN ('authorized', 'approved', 'paid', 'completed', 'aprovada') THEN 'pago'
            WHEN lower(cp.status) IN ('waiting_payment', 'pending', 'pendente', 'waiting') THEN 'pix_gerado'
            WHEN lower(cp.status) IN ('rejected', 'recusada', 'refused') THEN 'rejeitado'
            WHEN lower(cp.status) IN ('cancelled', 'canceled', 'cancelada') THEN 'cancelado'
            WHEN lower(cp.status) IN ('expired', 'expirada') THEN 'expirado'
            WHEN lower(cp.status) IN ('refunded', 'reembolsada', 'reembolsado') THEN 'reembolsado'
            WHEN lower(cp.status) = 'chargeback' THEN 'chargeback'
            ELSE COALESCE(lower(cp.status), 'evento_desconhecido')
        END,
        jsonb_build_object(
            'platform', COALESCE(cp.platform, 'unknown'),
            'product_name', cp.product_name,
            'status', cp.status,
            'amount', cp.gross_amount
        ),
        COALESCE(cp.purchased_at, now())
    FROM _lead_map lm
    JOIN customer_purchases cp ON cp.unified_customer_id = lm.unified_customer_id;

    GET DIAGNOSTICS v_event_count = ROW_COUNT;

    -- Cleanup temp table
    DROP TABLE IF EXISTS _lead_map;

    -- ═══════════════════════════════════════════════════════════════
    -- STEP 7: Update sync log
    -- ═══════════════════════════════════════════════════════════════
    UPDATE meta_sync_log SET
        status = 'completed',
        finished_at = now(),
        records_synced = v_lead_count,
        error = NULL
    WHERE id = p_log_id;

    RETURN v_lead_count;

EXCEPTION WHEN OTHERS THEN
    -- Cleanup temp table on error
    DROP TABLE IF EXISTS _lead_map;

    UPDATE meta_sync_log SET
        status = 'failed',
        finished_at = now(),
        records_synced = 0,
        error = SQLERRM
    WHERE id = p_log_id;

    RETURN 0;
END;
$$;

-- Grant execute to service role (edge functions use service role)
GRANT EXECUTE ON FUNCTION public.sync_leads_from_sales(uuid) TO service_role;

COMMENT ON FUNCTION public.sync_leads_from_sales IS
    'Sincroniza leads de unified_customers + customer_purchases para o funil BASE DE LEADS. '
    'Roda inteiramente no PostgreSQL sem overhead de rede. Chamada via Edge Function.';
