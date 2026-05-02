-- ═══════════════════════════════════════════════════════════════════
-- DIAGNÓSTICO: Por que vendas novas de Articulabem não aparecem
-- com badge de recontato no funil RECOMPRA - POTES
--
-- Rode TUDO no SQL Editor do Supabase. Cada bloco mostra uma coisa.
-- Me manda o resultado dos 4 blocos que eu te digo o próximo passo.
-- ═══════════════════════════════════════════════════════════════════

-- ───────────────────────────────────────────────────────────────────
-- BLOCO 1: Etapas do funil RECOMPRA - POTES
-- (pra a gente saber o ID exato de "Base de clientes" e
--  da etapa "Hora de recontatar" / equivalente)
-- ───────────────────────────────────────────────────────────────────
SELECT
  id          AS stage_id,
  name        AS etapa,
  sort_order,
  color
FROM lead_funnel_stages
WHERE funnel_id = '19f75912-295e-4c67-acad-275ce6849c5c'
ORDER BY sort_order ASC;


-- ───────────────────────────────────────────────────────────────────
-- BLOCO 2: Produtos JÁ cadastrados no funil RECOMPRA - POTES
-- (vamos ver se Articulabem está lá, e com qual recontact_days)
-- ───────────────────────────────────────────────────────────────────
SELECT
  id,
  product_name_contains,
  display_name,
  recontact_days,
  auto_move_stage_id,
  (SELECT name FROM lead_funnel_stages WHERE id = lfp.auto_move_stage_id) AS auto_move_stage_name
FROM lead_funnel_products lfp
WHERE lead_funnel_id = '19f75912-295e-4c67-acad-275ce6849c5c'
ORDER BY display_name;


-- ───────────────────────────────────────────────────────────────────
-- BLOCO 3: Produtos cadastrados em QUALQUER funil que mencionem articulabem
-- (pra ver se a Gabi cadastrou em outro funil por engano)
-- ───────────────────────────────────────────────────────────────────
SELECT
  lf.name                            AS funil,
  lfp.product_name_contains,
  lfp.display_name,
  lfp.recontact_days,
  (SELECT name FROM lead_funnel_stages WHERE id = lfp.auto_move_stage_id) AS auto_move_stage_name
FROM lead_funnel_products lfp
JOIN lead_funnels lf ON lf.id = lfp.lead_funnel_id
WHERE lfp.product_name_contains ILIKE '%articulabem%'
   OR lfp.display_name          ILIKE '%articulabem%'
ORDER BY lf.name;


-- ───────────────────────────────────────────────────────────────────
-- BLOCO 4: Vendas recentes de Articulabem e em quais funis o lead caiu
-- (pra confirmar se as vendas novas estão chegando ao funil RECOMPRA)
-- ───────────────────────────────────────────────────────────────────
WITH vendas_recentes AS (
  SELECT
    le.lead_id,
    le.created_at,
    le.metadata->>'product_name' AS product_name,
    le.funnel_id,
    lf.name AS funnel_name
  FROM lead_events le
  JOIN lead_funnels lf ON lf.id = le.funnel_id
  WHERE le.event_name = 'purchase'
    AND le.metadata->>'product_name' ILIKE '%articulabem%'
    AND le.created_at >= NOW() - INTERVAL '7 days'
)
SELECT
  lead_id,
  product_name,
  funnel_name,
  created_at
FROM vendas_recentes
ORDER BY lead_id, created_at DESC
LIMIT 50;
