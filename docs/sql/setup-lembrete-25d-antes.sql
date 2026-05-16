-- ════════════════════════════════════════════════════════════════════
-- SETUP: Etapa "Lembrete 25d antes" no funil RECOMPRA - POTES
--
-- Cria uma etapa intermediária entre "Compra Aprovada" e "Base de Recontato".
-- O lead é movido para "Lembrete 25d antes" quando falta 25 dias para o
-- pote acabar, e depois para "Base de Recontato" quando o pote acaba.
--
-- Fluxo:
--   Compra Aprovada ──(dias_produto − 25)──▶ Lembrete 25d antes ──(25d)──▶ Base de Recontato
--
-- Funil: RECOMPRA - POTES
-- ID: 19f75912-295e-4c67-acad-275ce6849c5c
--
-- ⚠️  IDEMPOTENTE: pode rodar várias vezes sem duplicar etapa/produtos.
-- ⚠️  ANTES DE RODAR: faça backup das tabelas lead_funnel_stages e
--     lead_funnel_products no mínimo do funil afetado.
-- ════════════════════════════════════════════════════════════════════

DO $$
DECLARE
  v_funnel_id uuid := '19f75912-295e-4c67-acad-275ce6849c5c';
  v_compra_aprovada_id uuid;
  v_base_recontato_id uuid;
  v_lembrete_id uuid;
  v_compra_order int;
  v_base_order int;
  v_lembrete_order int;
  v_org_id uuid;
  v_originais int := 0;
  v_novos int := 0;
  r record;
BEGIN
  -- 1) Localizar etapas existentes
  SELECT id, sort_order INTO v_compra_aprovada_id, v_compra_order
  FROM public.lead_funnel_stages
  WHERE funnel_id = v_funnel_id
    AND lower(name) LIKE '%compra%' AND lower(name) LIKE '%aprovad%'
  ORDER BY sort_order ASC LIMIT 1;

  SELECT id, sort_order INTO v_base_recontato_id, v_base_order
  FROM public.lead_funnel_stages
  WHERE funnel_id = v_funnel_id
    AND lower(name) LIKE '%base%' AND lower(name) LIKE '%recontat%'
  ORDER BY sort_order ASC LIMIT 1;

  IF v_compra_aprovada_id IS NULL THEN
    RAISE EXCEPTION 'Etapa "Compra Aprovada" não encontrada no funil %', v_funnel_id;
  END IF;
  IF v_base_recontato_id IS NULL THEN
    RAISE EXCEPTION 'Etapa "Base de Recontato" não encontrada no funil %', v_funnel_id;
  END IF;

  -- 2) Pegar organization_id do funil
  SELECT organization_id INTO v_org_id
  FROM public.lead_funnels WHERE id = v_funnel_id;

  -- 3) Criar (ou reusar) etapa "Lembrete 25d antes"
  SELECT id INTO v_lembrete_id
  FROM public.lead_funnel_stages
  WHERE funnel_id = v_funnel_id
    AND lower(name) = 'lembrete 25d antes'
  LIMIT 1;

  IF v_lembrete_id IS NULL THEN
    -- Posicionar entre Compra Aprovada e Base de Recontato
    v_lembrete_order := (v_compra_order + v_base_order) / 2;
    IF v_lembrete_order = v_compra_order OR v_lembrete_order = v_base_order THEN
      -- Sem espaço, empurra Base de Recontato +1 e usa compra+1
      UPDATE public.lead_funnel_stages
      SET sort_order = sort_order + 1
      WHERE funnel_id = v_funnel_id AND sort_order > v_compra_order;
      v_lembrete_order := v_compra_order + 1;
    END IF;

    INSERT INTO public.lead_funnel_stages (funnel_id, name, sort_order, color, organization_id)
    VALUES (v_funnel_id, 'Lembrete 25d antes', v_lembrete_order, '#F59E0B', v_org_id)
    RETURNING id INTO v_lembrete_id;

    RAISE NOTICE 'Etapa "Lembrete 25d antes" criada (id=%)', v_lembrete_id;
  ELSE
    RAISE NOTICE 'Etapa "Lembrete 25d antes" já existe (id=%) — apenas reconfigurando produtos', v_lembrete_id;
  END IF;

  -- 4) Para cada produto com recontact_days, criar "espelho" para a primeira parte
  --    do trajeto (Compra Aprovada → Lembrete 25d antes) e reconfigurar o original
  --    para a segunda parte (Lembrete 25d antes → Base de Recontato, 25 dias).
  FOR r IN
    SELECT id, product_name_contains, display_name, recontact_days, source_funnel_product_id
    FROM public.lead_funnel_products
    WHERE lead_funnel_id = v_funnel_id
      AND recontact_days IS NOT NULL
      AND recontact_days > 25
      AND auto_move_stage_id = v_base_recontato_id  -- só os originais "Compra→Base"
  LOOP
    -- 4a) Criar espelho "lembrete" se ainda não existir
    IF NOT EXISTS (
      SELECT 1 FROM public.lead_funnel_products
      WHERE lead_funnel_id = v_funnel_id
        AND product_name_contains = r.product_name_contains
        AND auto_move_stage_id = v_lembrete_id
    ) THEN
      INSERT INTO public.lead_funnel_products (
        lead_funnel_id, source_funnel_product_id, product_name_contains,
        display_name, recontact_days, auto_move_from_stage_id, auto_move_stage_id
      ) VALUES (
        v_funnel_id, r.source_funnel_product_id, r.product_name_contains,
        COALESCE(r.display_name, r.product_name_contains) || ' — Lembrete (' || (r.recontact_days - 25) || 'd)',
        r.recontact_days - 25, v_compra_aprovada_id, v_lembrete_id
      );
      v_novos := v_novos + 1;
    END IF;

    -- 4b) Ajustar original: agora sai de "Lembrete" e leva 25 dias
    UPDATE public.lead_funnel_products
    SET recontact_days = 25,
        auto_move_from_stage_id = v_lembrete_id,
        auto_move_stage_id = v_base_recontato_id,
        display_name = regexp_replace(COALESCE(display_name, product_name_contains), ' — (Lembrete|Recontato).*$', '') || ' — Recontato (25d finais)'
    WHERE id = r.id;
    v_originais := v_originais + 1;
  END LOOP;

  RAISE NOTICE '✅ Produtos espelhados criados: %', v_novos;
  RAISE NOTICE '✅ Produtos originais reconfigurados (Lembrete→Base, 25d): %', v_originais;
END;
$$;

-- ════════════════════════════════════════════════════════════════════
-- Conferência final
-- ════════════════════════════════════════════════════════════════════
SELECT
  lfp.product_name_contains AS produto,
  lfp.display_name,
  lfp.recontact_days AS dias,
  from_stage.name AS de,
  to_stage.name AS para
FROM public.lead_funnel_products lfp
LEFT JOIN public.lead_funnel_stages from_stage ON from_stage.id = lfp.auto_move_from_stage_id
LEFT JOIN public.lead_funnel_stages to_stage ON to_stage.id = lfp.auto_move_stage_id
WHERE lfp.lead_funnel_id = '19f75912-295e-4c67-acad-275ce6849c5c'
ORDER BY lfp.display_name NULLS LAST, lfp.product_name_contains, to_stage.name;

-- Etapas do funil (deve mostrar "Lembrete 25d antes" entre Compra Aprovada e Base de Recontato)
SELECT id, name, sort_order, color
FROM public.lead_funnel_stages
WHERE funnel_id = '19f75912-295e-4c67-acad-275ce6849c5c'
ORDER BY sort_order;

-- ════════════════════════════════════════════════════════════════════
-- ROLLBACK (se precisar desfazer)
-- ════════════════════════════════════════════════════════════════════
-- 1) Restaurar produtos originais (volta dias e from_stage):
--    UPDATE public.lead_funnel_products
--    SET recontact_days = (dias_originais_aqui),
--        auto_move_from_stage_id = (id_compra_aprovada)
--    WHERE lead_funnel_id = '19f75912-...'
--      AND auto_move_stage_id = (id_base_recontato);
--
-- 2) Apagar espelhos:
--    DELETE FROM public.lead_funnel_products
--    WHERE lead_funnel_id = '19f75912-...'
--      AND auto_move_stage_id = (id_lembrete);
--
-- 3) Apagar etapa Lembrete (cuidado: leads na etapa ficam órfãos):
--    DELETE FROM public.lead_funnel_stages
--    WHERE id = (id_lembrete);
