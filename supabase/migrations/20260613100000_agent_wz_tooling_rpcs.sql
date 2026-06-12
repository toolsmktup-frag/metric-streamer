-- ============================================================================
-- AGENT TOOLING: RPCs para criar/duplicar automações e onboarding de produtos
-- ============================================================================
-- Permite que agentes (Claude Code no chat via Management API, e o futuro
-- agente de suporte via MCP) operem automações sem mexer no editor visual:
--   • agent_clone_wz_flow         — duplica flow trocando produto/mensagens
--   • agent_upsert_funnel_product — produto + N raw names num funil
--   • agent_link_flow_to_funnel   — vínculo lead_funnel_automations
--   • agent_get_funnel_overview   — inspeção completa de um funil
--   • agent_list_unmapped_products— fila de produtos sem mapeamento
--   • agent_onboard_product       — orquestrador (produto→flow→vínculo)
--
-- Garantias: clones nascem SEMPRE is_active=false (ativação é só na UI);
-- node ids são regenerados (contadores de ab_split são por node_id global —
-- ver wz-executor); toda chamada é logada em agent_action_logs.
-- ============================================================================

-- ── Auditoria ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.agent_action_logs (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  action     text NOT NULL,
  params     jsonb NOT NULL DEFAULT '{}'::jsonb,
  result     jsonb,
  success    boolean NOT NULL DEFAULT true,
  actor      text NOT NULL DEFAULT 'claude-agent',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_agent_action_logs_created ON public.agent_action_logs (created_at DESC);
ALTER TABLE public.agent_action_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "agent_action_logs_select" ON public.agent_action_logs;
CREATE POLICY "agent_action_logs_select" ON public.agent_action_logs
  FOR SELECT TO authenticated USING (true);

-- ── Idempotência: 1 config por fragmento (case-insensitive) por funil ──────
CREATE UNIQUE INDEX IF NOT EXISTS uq_lead_funnel_products_contains
  ON public.lead_funnel_products (lead_funnel_id, lower(product_name_contains));

-- ── Helpers internos (sem GRANT — uso interno das RPCs) ────────────────────
CREATE OR REPLACE FUNCTION public._agent_apply_repl(p_text text, p_repl jsonb)
RETURNS text LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE r jsonb; v text := p_text; v_from text; v_to text;
BEGIN
  IF p_text IS NULL OR p_repl IS NULL OR jsonb_typeof(p_repl) <> 'array' THEN
    RETURN p_text;
  END IF;
  FOR r IN SELECT * FROM jsonb_array_elements(p_repl) LOOP
    v_from := r->>'from';
    v_to   := r->>'to';
    CONTINUE WHEN v_from IS NULL OR v_from = '' OR v_to IS NULL;
    -- escapa regex no padrão e \ / & na substituição; case-insensitive
    v := regexp_replace(
      v,
      regexp_replace(v_from, '([.^$*+?()\[\]{}|\\])', '\\\1', 'g'),
      replace(replace(v_to, '\', '\\'), '&', '\&'),
      'gi'
    );
  END LOOP;
  RETURN v;
END $$;

CREATE OR REPLACE FUNCTION public._agent_log(
  p_action text, p_params jsonb, p_result jsonb, p_success boolean DEFAULT true
) RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  INSERT INTO public.agent_action_logs (action, params, result, success)
  VALUES (p_action, COALESCE(p_params, '{}'::jsonb), p_result, p_success);
$$;

-- ════════════════════════════════════════════════════════════════════════════
-- 1) agent_clone_wz_flow
-- p_replacements: {
--   "product_ids":   ["123","456"],            -- vira data.productIdFilter dos triggers
--   "product_labels": {"123":"Produto (Guru)"},-- vira data.productIdLabels
--   "text_replacements": [{"from":"Articulabem","to":"Manual das Ervas"}],
--   "instance_id": null, "instance_name": null -- troca instância dos nós whatsapp
-- }
-- ════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.agent_clone_wz_flow(
  p_source_flow_id uuid,
  p_new_name       text,
  p_replacements   jsonb DEFAULT '{}'::jsonb,
  p_dry_run        boolean DEFAULT false
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_src record;
  v_new_id uuid := gen_random_uuid();
  v_suffix text;
  v_idmap jsonb := '{}'::jsonb;
  v_nodes jsonb := '[]'::jsonb;
  v_nodes2 jsonb := '[]'::jsonb;
  v_edges jsonb := '[]'::jsonb;
  v_node jsonb; v_new_node jsonb; v_edge jsonb;
  v_old_id text; v_new_node_id text; v_target text;
  v_repl jsonb := COALESCE(p_replacements->'text_replacements', '[]'::jsonb);
  v_msgs jsonb; v_msg jsonb; v_new_msgs jsonb;
  v_blocks jsonb; v_block jsonb; v_new_blocks jsonb;
  v_txt text; v_new_txt text;
  v_msgs_changed int := 0;
  v_triggers_updated int := 0;
  v_existing uuid;
  v_result jsonb;
  v_preview jsonb := '[]'::jsonb;
BEGIN
  SELECT id INTO v_existing FROM wz_flows WHERE LOWER(name) = LOWER(p_new_name);
  IF FOUND THEN
    v_result := jsonb_build_object('status','exists','flow_id',v_existing,'name',p_new_name);
    PERFORM _agent_log('clone_wz_flow', jsonb_build_object('source',p_source_flow_id,'new_name',p_new_name), v_result);
    RETURN v_result;
  END IF;

  SELECT * INTO v_src FROM wz_flows WHERE id = p_source_flow_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Flow fonte % não encontrado', p_source_flow_id;
  END IF;

  v_suffix := substr(replace(v_new_id::text, '-', ''), 1, 8);

  -- ── Passo 1: transforma nós (id novo + conteúdo) ──
  FOR v_node IN SELECT * FROM jsonb_array_elements(COALESCE(v_src.nodes, '[]'::jsonb)) LOOP
    v_old_id := v_node->>'id';
    v_new_node_id := v_old_id || '_' || v_suffix;
    v_idmap := v_idmap || jsonb_build_object(v_old_id, v_new_node_id);
    v_new_node := jsonb_set(v_node, '{id}', to_jsonb(v_new_node_id));

    -- label (qualquer nó)
    IF v_new_node->'data' ? 'label' AND jsonb_typeof(v_new_node->'data'->'label') = 'string' THEN
      v_new_node := jsonb_set(v_new_node, '{data,label}',
        to_jsonb(_agent_apply_repl(v_new_node->'data'->>'label', v_repl)));
    END IF;

    IF v_node->>'type' = 'trigger' THEN
      IF p_replacements ? 'product_ids' THEN
        v_new_node := jsonb_set(v_new_node, '{data,productIdFilter}', p_replacements->'product_ids');
        v_new_node := jsonb_set(v_new_node, '{data,productIdLabels}',
          COALESCE(p_replacements->'product_labels', '{}'::jsonb));
        v_triggers_updated := v_triggers_updated + 1;
      END IF;

    ELSIF v_node->>'type' = 'whatsapp' THEN
      IF v_new_node->'data' ? 'stats' THEN
        v_new_node := jsonb_set(v_new_node, '{data,stats}',
          '{"total":0,"failed":0,"pending":0,"success":0}'::jsonb);
      END IF;
      IF COALESCE(p_replacements->>'instance_id','') <> '' THEN
        v_new_node := jsonb_set(v_new_node, '{data,instanceId}', to_jsonb(p_replacements->>'instance_id'));
        IF COALESCE(p_replacements->>'instance_name','') <> '' THEN
          v_new_node := jsonb_set(v_new_node, '{data,instanceName}', to_jsonb(p_replacements->>'instance_name'));
        END IF;
      END IF;
      -- mensagens: messages[].text + messages[].blocks[].(text|caption)
      v_msgs := v_new_node->'data'->'messages';
      IF v_msgs IS NOT NULL AND jsonb_typeof(v_msgs) = 'array' THEN
        v_new_msgs := '[]'::jsonb;
        FOR v_msg IN SELECT * FROM jsonb_array_elements(v_msgs) LOOP
          IF v_msg ? 'text' AND jsonb_typeof(v_msg->'text') = 'string' THEN
            v_txt := v_msg->>'text';
            v_new_txt := _agent_apply_repl(v_txt, v_repl);
            IF v_new_txt IS DISTINCT FROM v_txt THEN v_msgs_changed := v_msgs_changed + 1; END IF;
            v_msg := jsonb_set(v_msg, '{text}', to_jsonb(v_new_txt));
          END IF;
          v_blocks := v_msg->'blocks';
          IF v_blocks IS NOT NULL AND jsonb_typeof(v_blocks) = 'array' THEN
            v_new_blocks := '[]'::jsonb;
            FOR v_block IN SELECT * FROM jsonb_array_elements(v_blocks) LOOP
              IF v_block ? 'text' AND jsonb_typeof(v_block->'text') = 'string' THEN
                v_block := jsonb_set(v_block, '{text}', to_jsonb(_agent_apply_repl(v_block->>'text', v_repl)));
              END IF;
              IF v_block ? 'caption' AND jsonb_typeof(v_block->'caption') = 'string' THEN
                v_block := jsonb_set(v_block, '{caption}', to_jsonb(_agent_apply_repl(v_block->>'caption', v_repl)));
              END IF;
              v_new_blocks := v_new_blocks || v_block;
            END LOOP;
            v_msg := jsonb_set(v_msg, '{blocks}', v_new_blocks);
          END IF;
          v_new_msgs := v_new_msgs || v_msg;
        END LOOP;
        v_new_node := jsonb_set(v_new_node, '{data,messages}', v_new_msgs);
      END IF;

    ELSIF v_node->>'type' = 'note' THEN
      IF v_new_node->'data' ? 'text' AND jsonb_typeof(v_new_node->'data'->'text') = 'string' THEN
        v_new_node := jsonb_set(v_new_node, '{data,text}',
          to_jsonb(_agent_apply_repl(v_new_node->'data'->>'text', v_repl)));
      END IF;
    END IF;

    v_nodes := v_nodes || v_new_node;
  END LOOP;

  -- ── Passo 2: remapeia referências internas (goto.targetNodeId etc.) ──
  FOR v_node IN SELECT * FROM jsonb_array_elements(v_nodes) LOOP
    v_new_node := v_node;
    v_target := v_node->'data'->>'targetNodeId';
    IF v_target IS NOT NULL AND v_idmap ? v_target THEN
      v_new_node := jsonb_set(v_new_node, '{data,targetNodeId}', v_idmap->v_target);
    END IF;
    v_nodes2 := v_nodes2 || v_new_node;
  END LOOP;

  -- ── Edges: regenera ids e remapeia source/target ──
  FOR v_edge IN SELECT * FROM jsonb_array_elements(COALESCE(v_src.edges, '[]'::jsonb)) LOOP
    v_edge := jsonb_set(v_edge, '{id}', to_jsonb((v_edge->>'id') || '_' || v_suffix));
    IF v_idmap ? (v_edge->>'source') THEN
      v_edge := jsonb_set(v_edge, '{source}', v_idmap->(v_edge->>'source'));
    END IF;
    IF v_idmap ? (v_edge->>'target') THEN
      v_edge := jsonb_set(v_edge, '{target}', v_idmap->(v_edge->>'target'));
    END IF;
    v_edges := v_edges || v_edge;
  END LOOP;

  IF p_dry_run THEN
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'type', n->>'type',
      'trigger', n->'data'->>'triggerType',
      'productIdFilter', n->'data'->'productIdFilter',
      'sample_msg', LEFT(COALESCE(n->'data'->'messages'->0->>'text',''), 200)
    )), '[]'::jsonb) INTO v_preview
    FROM jsonb_array_elements(v_nodes2) n
    WHERE n->>'type' IN ('trigger','whatsapp');

    RETURN jsonb_build_object(
      'status','dry_run','would_create',p_new_name,
      'nodes',jsonb_array_length(v_nodes2),'edges',jsonb_array_length(v_edges),
      'triggers_updated',v_triggers_updated,'messages_changed',v_msgs_changed,
      'preview',v_preview
    );
  END IF;

  INSERT INTO wz_flows (id, name, description, platform, product_filter, is_active, nodes, edges)
  VALUES (v_new_id, p_new_name, v_src.description, v_src.platform, v_src.product_filter, false, v_nodes2, v_edges);

  v_result := jsonb_build_object(
    'status','created','flow_id',v_new_id,'name',p_new_name,
    'nodes',jsonb_array_length(v_nodes2),'edges',jsonb_array_length(v_edges),
    'triggers_updated',v_triggers_updated,'messages_changed',v_msgs_changed,
    'is_active',false
  );
  PERFORM _agent_log('clone_wz_flow',
    jsonb_build_object('source',p_source_flow_id,'new_name',p_new_name,'replacements',p_replacements),
    v_result);
  RETURN v_result;
END $$;

-- ════════════════════════════════════════════════════════════════════════════
-- 2) agent_upsert_funnel_product — produto canônico + N raw names
-- ════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.agent_upsert_funnel_product(
  p_funnel_id      uuid,
  p_contains       text,
  p_display_name   text,
  p_recontact_days integer DEFAULT NULL,
  p_raw_names      text[]  DEFAULT '{}'
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_lfp_id uuid;
  v_raw text;
  v_mapped int := 0;
  v_collisions jsonb;
  v_unmatched jsonb;
  v_platform_ids jsonb;
  v_sales jsonb;
  v_result jsonb;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM lead_funnels WHERE id = p_funnel_id) THEN
    RAISE EXCEPTION 'Funil % não existe em lead_funnels', p_funnel_id;
  END IF;
  IF COALESCE(TRIM(p_contains),'') = '' THEN
    RAISE EXCEPTION 'p_contains não pode ser vazio';
  END IF;

  INSERT INTO lead_funnel_products (lead_funnel_id, product_name_contains, display_name, recontact_days)
  VALUES (p_funnel_id, TRIM(p_contains), NULLIF(TRIM(p_display_name),''), p_recontact_days)
  ON CONFLICT (lead_funnel_id, lower(product_name_contains)) DO UPDATE
    SET display_name   = EXCLUDED.display_name,
        recontact_days = EXCLUDED.recontact_days
  RETURNING id INTO v_lfp_id;

  FOREACH v_raw IN ARRAY COALESCE(p_raw_names, '{}') LOOP
    CONTINUE WHEN COALESCE(TRIM(v_raw),'') = '';
    INSERT INTO lead_product_mappings (lead_funnel_id, raw_product_name, lead_funnel_product_id)
    VALUES (p_funnel_id, TRIM(v_raw), v_lfp_id)
    ON CONFLICT (lead_funnel_id, raw_product_name) DO UPDATE
      SET lead_funnel_product_id = EXCLUDED.lead_funnel_product_id;
    v_mapped := v_mapped + 1;
  END LOOP;

  -- colisões: OUTRAS configs do funil cujo contains também casa algum raw name
  SELECT COALESCE(jsonb_agg(DISTINCT jsonb_build_object(
           'config', o.product_name_contains, 'display', o.display_name)), '[]'::jsonb)
    INTO v_collisions
  FROM lead_funnel_products o, unnest(COALESCE(p_raw_names,'{}')) rn
  WHERE o.lead_funnel_id = p_funnel_id AND o.id <> v_lfp_id
    AND rn ILIKE '%' || o.product_name_contains || '%';

  -- raw names que NÃO casam com o próprio contains (mapping cobre, mas avisa)
  SELECT COALESCE(jsonb_agg(rn), '[]'::jsonb) INTO v_unmatched
  FROM unnest(COALESCE(p_raw_names,'{}')) rn
  WHERE rn NOT ILIKE '%' || TRIM(p_contains) || '%';

  -- product_ids por plataforma (prontos pro clone)
  SELECT COALESCE(jsonb_agg(DISTINCT jsonb_build_object('platform', platform, 'product_id', product_id)), '[]'::jsonb)
    INTO v_platform_ids
  FROM v_all_sales
  WHERE product_id IS NOT NULL
    AND LOWER(product_name) IN (SELECT LOWER(TRIM(rn)) FROM unnest(COALESCE(p_raw_names,'{}')) rn);

  SELECT COALESCE(jsonb_object_agg(x.product_name, x.n), '{}'::jsonb) INTO v_sales
  FROM (
    SELECT product_name, COUNT(*) AS n FROM v_all_sales
    WHERE status = 'authorized'
      AND LOWER(product_name) IN (SELECT LOWER(TRIM(rn)) FROM unnest(COALESCE(p_raw_names,'{}')) rn)
    GROUP BY product_name
  ) x;

  v_result := jsonb_build_object(
    'lead_funnel_product_id', v_lfp_id,
    'contains', TRIM(p_contains),
    'mappings_upserted', v_mapped,
    'collisions', v_collisions,
    'raw_names_fora_do_contains', v_unmatched,
    'platform_product_ids', v_platform_ids,
    'sales_by_raw_name', v_sales
  );
  PERFORM _agent_log('upsert_funnel_product',
    jsonb_build_object('funnel_id',p_funnel_id,'contains',p_contains,'display',p_display_name,
                       'recontact_days',p_recontact_days,'raw_names',to_jsonb(p_raw_names)),
    v_result);
  RETURN v_result;
END $$;

-- ════════════════════════════════════════════════════════════════════════════
-- 3) agent_link_flow_to_funnel
-- ════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.agent_link_flow_to_funnel(
  p_funnel_id           uuid,
  p_flow_id             uuid,
  p_trigger_events      text[]  DEFAULT '{}',
  p_show_in_automations boolean DEFAULT false
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id uuid; v_result jsonb;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM lead_funnels WHERE id = p_funnel_id) THEN
    RAISE EXCEPTION 'Funil % não existe', p_funnel_id;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM wz_flows WHERE id = p_flow_id) THEN
    RAISE EXCEPTION 'Flow % não existe', p_flow_id;
  END IF;

  SELECT id INTO v_id FROM lead_funnel_automations
  WHERE funnel_id = p_funnel_id AND wz_flow_id = p_flow_id;
  IF FOUND THEN
    v_result := jsonb_build_object('status','exists','link_id',v_id);
  ELSE
    INSERT INTO lead_funnel_automations (funnel_id, wz_flow_id, trigger_events, show_in_automations)
    VALUES (p_funnel_id, p_flow_id, COALESCE(p_trigger_events,'{}'), p_show_in_automations)
    RETURNING id INTO v_id;
    v_result := jsonb_build_object('status','created','link_id',v_id);
  END IF;

  PERFORM _agent_log('link_flow_to_funnel',
    jsonb_build_object('funnel_id',p_funnel_id,'flow_id',p_flow_id), v_result);
  RETURN v_result;
END $$;

-- ════════════════════════════════════════════════════════════════════════════
-- 4) agent_get_funnel_overview / agent_list_unmapped_products (leitura)
-- ════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.agent_get_funnel_overview(p_funnel_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
SELECT jsonb_build_object(
  'funnel', (SELECT to_jsonb(x) FROM (
      SELECT id, name, description, is_active FROM lead_funnels WHERE id = p_funnel_id) x),
  'stages', (SELECT COALESCE(jsonb_agg(jsonb_build_object('id',s.id,'name',s.name,'order',s.sort_order) ORDER BY s.sort_order),'[]'::jsonb)
      FROM lead_funnel_stages s WHERE s.funnel_id = p_funnel_id),
  'transition_rules', (SELECT COALESCE(jsonb_agg(jsonb_build_object('event',r.event_name,'to',ts.name)),'[]'::jsonb)
      FROM stage_transition_rules r JOIN lead_funnel_stages ts ON ts.id = r.to_stage_id
      WHERE r.funnel_id = p_funnel_id),
  'products', (SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'id',p.id,'contains',p.product_name_contains,'display',p.display_name,
        'recontact_days',p.recontact_days,'pot_duration_days',p.pot_duration_days,
        'raw_names',(SELECT COALESCE(jsonb_agg(m.raw_product_name),'[]'::jsonb)
                     FROM lead_product_mappings m WHERE m.lead_funnel_product_id = p.id))),'[]'::jsonb)
      FROM lead_funnel_products p WHERE p.lead_funnel_id = p_funnel_id),
  'automations', (SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'flow_id',w.id,'flow',w.name,'flow_active',w.is_active,
        'show_in_automations',a.show_in_automations,
        'triggers',(SELECT COALESCE(jsonb_agg(jsonb_build_object(
              'type',n->'data'->>'triggerType','platform',n->'data'->>'platform',
              'disabled',n->'data'->>'disabled','productIdFilter',n->'data'->'productIdFilter')),'[]'::jsonb)
            FROM jsonb_array_elements(w.nodes) n WHERE n->>'type' = 'trigger'),
        'execs_30d',(SELECT COUNT(*) FROM wz_executions e
            WHERE e.flow_id = w.id AND e.started_at > now() - interval '30 days'))),'[]'::jsonb)
      FROM lead_funnel_automations a JOIN wz_flows w ON w.id = a.wz_flow_id
      WHERE a.funnel_id = p_funnel_id),
  'leads_count', (SELECT COUNT(*) FROM lead_stage_positions WHERE funnel_id = p_funnel_id)
);
$$;

CREATE OR REPLACE FUNCTION public.agent_list_unmapped_products(
  p_funnel_id uuid,
  p_days      integer DEFAULT 365,
  p_min_sales integer DEFAULT 20
) RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'product_name', t.product_name,
    'sales', t.n,
    'last_sale', t.ultima,
    'platform_product_ids', t.pids
  ) ORDER BY t.n DESC), '[]'::jsonb)
FROM (
  SELECT v.product_name, COUNT(*) AS n, MAX(v.purchased_at)::date AS ultima,
         jsonb_agg(DISTINCT jsonb_build_object('platform', v.platform, 'product_id', v.product_id))
           FILTER (WHERE v.product_id IS NOT NULL) AS pids
  FROM v_all_sales v
  WHERE v.status = 'authorized'
    AND v.product_name IS NOT NULL
    AND v.purchased_at > now() - make_interval(days => p_days)
    AND NOT EXISTS (SELECT 1 FROM lead_product_mappings m
                    WHERE m.lead_funnel_id = p_funnel_id
                      AND LOWER(m.raw_product_name) = LOWER(v.product_name))
    AND NOT EXISTS (SELECT 1 FROM lead_funnel_products p
                    WHERE p.lead_funnel_id = p_funnel_id
                      AND v.product_name ILIKE '%' || p.product_name_contains || '%')
  GROUP BY v.product_name
  HAVING COUNT(*) >= p_min_sales
) t;
$$;

-- ════════════════════════════════════════════════════════════════════════════
-- 5) agent_onboard_product — orquestrador
-- ════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.agent_onboard_product(
  p_funnel_id         uuid,
  p_display_name      text,
  p_contains          text,
  p_raw_names         text[],
  p_recontact_days    integer DEFAULT NULL,
  p_source_flow_id    uuid    DEFAULT NULL,
  p_flow_name         text    DEFAULT NULL,
  p_product_ids       text[]  DEFAULT NULL,
  p_text_replacements jsonb   DEFAULT '[]'::jsonb
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_product jsonb;
  v_ids jsonb;
  v_labels jsonb := '{}'::jsonb;
  v_flow jsonb := NULL;
  v_link jsonb := NULL;
  v_flow_name text;
  v_flow_id uuid;
  v_e jsonb;
BEGIN
  v_product := agent_upsert_funnel_product(p_funnel_id, p_contains, p_display_name, p_recontact_days, p_raw_names);

  IF p_source_flow_id IS NOT NULL THEN
    -- ids: explícitos ou auto-resolvidos das vendas
    IF p_product_ids IS NOT NULL AND array_length(p_product_ids,1) > 0 THEN
      v_ids := to_jsonb(p_product_ids);
      FOR v_e IN SELECT to_jsonb(x) FROM unnest(p_product_ids) x LOOP
        v_labels := v_labels || jsonb_build_object(v_e #>> '{}', p_display_name);
      END LOOP;
    ELSE
      SELECT COALESCE(jsonb_agg(DISTINCT e->>'product_id'), '[]'::jsonb) INTO v_ids
      FROM jsonb_array_elements(v_product->'platform_product_ids') e;
      FOR v_e IN SELECT * FROM jsonb_array_elements(v_product->'platform_product_ids') LOOP
        v_labels := v_labels || jsonb_build_object(
          v_e->>'product_id', p_display_name || ' (' || (v_e->>'platform') || ')');
      END LOOP;
    END IF;

    IF v_ids IS NULL OR jsonb_array_length(v_ids) = 0 THEN
      RAISE EXCEPTION 'Nenhum product_id encontrado para % — informe p_product_ids', p_display_name;
    END IF;

    v_flow_name := COALESCE(NULLIF(TRIM(p_flow_name),''), 'Entrega - ' || p_display_name);
    v_flow := agent_clone_wz_flow(
      p_source_flow_id, v_flow_name,
      jsonb_build_object('product_ids', v_ids, 'product_labels', v_labels,
                         'text_replacements', COALESCE(p_text_replacements,'[]'::jsonb)),
      false);
    v_flow_id := (v_flow->>'flow_id')::uuid;
    v_link := agent_link_flow_to_funnel(p_funnel_id, v_flow_id, '{}', false);
  END IF;

  RETURN jsonb_build_object('product', v_product, 'flow', v_flow, 'link', v_link);
END $$;

-- ── Permissões ──────────────────────────────────────────────────────────────
REVOKE ALL ON FUNCTION public._agent_apply_repl(text, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public._agent_log(text, jsonb, jsonb, boolean) FROM PUBLIC;
DO $$
DECLARE fn text;
BEGIN
  FOREACH fn IN ARRAY ARRAY[
    'agent_clone_wz_flow(uuid, text, jsonb, boolean)',
    'agent_upsert_funnel_product(uuid, text, text, integer, text[])',
    'agent_link_flow_to_funnel(uuid, uuid, text[], boolean)',
    'agent_get_funnel_overview(uuid)',
    'agent_list_unmapped_products(uuid, integer, integer)',
    'agent_onboard_product(uuid, text, text, text[], integer, uuid, text, text[], jsonb)'
  ] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION public.%s FROM PUBLIC, anon', fn);
    EXECUTE format('GRANT EXECUTE ON FUNCTION public.%s TO authenticated, service_role', fn);
  END LOOP;
END $$;
