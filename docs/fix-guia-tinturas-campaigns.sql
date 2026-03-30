-- ═══════════════════════════════════════════════════════════════════
-- FIX: Corrigir atribuição de campanhas Meta ao funil Guia de Tinturas
-- 
-- Problema: auto_assign_campaign_funnels atribuiu TODAS as campanhas
-- ao Guia de Tinturas (único funil ativo na época). Campanhas do
-- ArticulaBEM ficaram erroneamente vinculadas.
--
-- Rodar no SQL Editor do Supabase Dashboard
-- ═══════════════════════════════════════════════════════════════════

-- 1) Ver situação atual
SELECT id, name, funnel_id 
FROM meta_campaigns 
WHERE funnel_id IS NOT NULL 
ORDER BY name;

-- 2) Resetar TODAS as atribuições do Guia de Tinturas para re-calcular
UPDATE meta_campaigns SET funnel_id = NULL
WHERE funnel_id = '10000000-0000-0000-0000-000000000001';

UPDATE meta_adsets SET funnel_id = NULL
WHERE funnel_id = '10000000-0000-0000-0000-000000000001';

UPDATE meta_ads SET funnel_id = NULL
WHERE funnel_id = '10000000-0000-0000-0000-000000000001';

-- 3) Verificar funnel_products — as keywords devem ser específicas
SELECT f.name AS funnel_name, fp.product_name_contains, fp.funnel_position
FROM funnel_products fp
JOIN funnels f ON f.id = fp.funnel_id
WHERE f.is_active = true
ORDER BY f.name, fp.funnel_position;

-- 4) Re-executar auto_assign (agora com ambos funis ativos)
SELECT auto_assign_campaign_funnels();

-- 5) Verificar resultado
SELECT 
  f.name AS funnel_name,
  mc.name AS campaign_name,
  mc.funnel_id
FROM meta_campaigns mc
LEFT JOIN funnels f ON f.id = mc.funnel_id
WHERE mc.funnel_id IS NOT NULL
ORDER BY f.name, mc.name;
