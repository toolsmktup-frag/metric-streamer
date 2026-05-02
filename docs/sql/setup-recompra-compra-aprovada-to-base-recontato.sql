-- ════════════════════════════════════════════════════════════════════
-- SETUP SEGURO: Recompra só sai de "Compra Aprovada"
--
-- Regra final:
--   Lead fica em "Compra Aprovada" quando comprou.
--   Depois de X dias do produto, vai para "Base de Recontato".
--   Se a vendedora mover para negociação / aguardando resposta / não fechou,
--   o cron NÃO mexe mais nesse lead.
--
-- Funil: RECOMPRA - POTES
-- ID: 19f75912-295e-4c67-acad-275ce6849c5c
-- ════════════════════════════════════════════════════════════════════

-- 1) Coluna de origem: de qual etapa o robô pode mover o lead
ALTER TABLE public.lead_funnel_products
ADD COLUMN IF NOT EXISTS auto_move_from_stage_id uuid
  REFERENCES public.lead_funnel_stages(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.lead_funnel_products.auto_move_from_stage_id IS
  'Etapa de origem: o cron/botão Atualizar Funil só move o lead se ele estiver nesta etapa. NULL = qualquer etapa.';

-- 2) Configurar produtos do funil RECOMPRA - POTES:
--    DE: Compra Aprovada
--    PARA: Base de Recontato
DO $$
DECLARE
  v_funnel_id uuid := '19f75912-295e-4c67-acad-275ce6849c5c';
  v_from_stage_id uuid;
  v_to_stage_id uuid;
  v_updated int := 0;
BEGIN
  SELECT id INTO v_from_stage_id
  FROM public.lead_funnel_stages
  WHERE funnel_id = v_funnel_id
    AND lower(name) LIKE '%compra%'
    AND lower(name) LIKE '%aprovad%'
  ORDER BY sort_order ASC
  LIMIT 1;

  SELECT id INTO v_to_stage_id
  FROM public.lead_funnel_stages
  WHERE funnel_id = v_funnel_id
    AND lower(name) LIKE '%recontat%'
  ORDER BY
    CASE WHEN lower(name) LIKE '%base%' THEN 0 ELSE 1 END,
    sort_order ASC
  LIMIT 1;

  IF v_from_stage_id IS NULL THEN
    RAISE EXCEPTION 'Não encontrei a etapa de origem "Compra Aprovada" no funil %. Confira o nome da etapa.', v_funnel_id;
  END IF;

  IF v_to_stage_id IS NULL THEN
    RAISE EXCEPTION 'Não encontrei a etapa de destino "Base de Recontato" no funil %. Confira o nome da etapa.', v_funnel_id;
  END IF;

  UPDATE public.lead_funnel_products
  SET
    auto_move_from_stage_id = v_from_stage_id,
    auto_move_stage_id = v_to_stage_id
  WHERE lead_funnel_id = v_funnel_id
    AND recontact_days IS NOT NULL;

  GET DIAGNOSTICS v_updated = ROW_COUNT;

  RAISE NOTICE 'Configuração aplicada com segurança.';
  RAISE NOTICE 'DE: %', (SELECT name FROM public.lead_funnel_stages WHERE id = v_from_stage_id);
  RAISE NOTICE 'PARA: %', (SELECT name FROM public.lead_funnel_stages WHERE id = v_to_stage_id);
  RAISE NOTICE 'Produtos atualizados: %', v_updated;
END;
$$;

-- 3) Conferência final
SELECT
  lf.name AS funil,
  lfp.product_name_contains AS produto_contendo,
  lfp.display_name AS produto_nome,
  lfp.recontact_days AS dias_recontato,
  from_stage.name AS de_etapa,
  to_stage.name AS para_etapa
FROM public.lead_funnel_products lfp
JOIN public.lead_funnels lf ON lf.id = lfp.lead_funnel_id
LEFT JOIN public.lead_funnel_stages from_stage ON from_stage.id = lfp.auto_move_from_stage_id
LEFT JOIN public.lead_funnel_stages to_stage ON to_stage.id = lfp.auto_move_stage_id
WHERE lfp.lead_funnel_id = '19f75912-295e-4c67-acad-275ce6849c5c'
ORDER BY lfp.display_name, lfp.product_name_contains;
