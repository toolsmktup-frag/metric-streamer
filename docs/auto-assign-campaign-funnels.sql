-- ═══════════════════════════════════════════════════════════════════
-- RPC: auto_assign_campaign_funnels
-- Vincula automaticamente campanhas/adsets/ads a funis baseado nas
-- palavras-chave dos funnel_products (product_name_contains).
--
-- Também aceita o nome do funil como fallback de matching.
--
-- Rodar no SQL Editor do Supabase Dashboard
-- ═══════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.auto_assign_campaign_funnels()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  campaigns_updated integer := 0;
  adsets_updated integer := 0;
  ads_updated integer := 0;
BEGIN
  -- 1. Match campaigns sem funnel_id usando keywords dos funnel_products
  --    Prioriza o match mais longo (mais específico)
  UPDATE meta_campaigns mc
  SET funnel_id = matched.funnel_id
  FROM (
    SELECT DISTINCT ON (mc2.id)
      mc2.id AS campaign_id,
      f.id   AS funnel_id
    FROM meta_campaigns mc2
    CROSS JOIN funnels f
    JOIN funnel_products fp ON fp.funnel_id = f.id
    WHERE mc2.funnel_id IS NULL
      AND f.is_active = true
      AND length(fp.product_name_contains) >= 3
      AND mc2.name ILIKE '%' || fp.product_name_contains || '%'
    ORDER BY mc2.id, length(fp.product_name_contains) DESC
  ) matched
  WHERE mc.id = matched.campaign_id;

  GET DIAGNOSTICS campaigns_updated = ROW_COUNT;

  -- 1b. Fallback: match pelo nome do funil (ex: "articulabem" no nome da campanha)
  UPDATE meta_campaigns mc
  SET funnel_id = matched.funnel_id
  FROM (
    SELECT DISTINCT ON (mc2.id)
      mc2.id AS campaign_id,
      f.id   AS funnel_id
    FROM meta_campaigns mc2
    CROSS JOIN funnels f
    WHERE mc2.funnel_id IS NULL
      AND f.is_active = true
      AND length(f.name) >= 3
      AND mc2.name ILIKE '%' || f.name || '%'
    ORDER BY mc2.id, length(f.name) DESC
  ) matched
  WHERE mc.id = matched.campaign_id;

  GET DIAGNOSTICS adsets_updated = ROW_COUNT;
  campaigns_updated := campaigns_updated + adsets_updated;

  -- 2. Propagar funnel_id para adsets (herda da campanha)
  UPDATE meta_adsets ma
  SET funnel_id = mc.funnel_id
  FROM meta_campaigns mc
  WHERE ma.campaign_id = mc.id
    AND mc.funnel_id IS NOT NULL
    AND (ma.funnel_id IS NULL OR ma.funnel_id != mc.funnel_id);

  GET DIAGNOSTICS adsets_updated = ROW_COUNT;

  -- 3. Propagar funnel_id para ads (herda da campanha)
  UPDATE meta_ads mad
  SET funnel_id = mc.funnel_id
  FROM meta_campaigns mc
  WHERE mad.campaign_id = mc.id
    AND mc.funnel_id IS NOT NULL
    AND (mad.funnel_id IS NULL OR mad.funnel_id != mc.funnel_id);

  GET DIAGNOSTICS ads_updated = ROW_COUNT;

  RAISE LOG 'auto_assign_campaign_funnels: % campaigns, % adsets, % ads updated',
    campaigns_updated, adsets_updated, ads_updated;

  RETURN campaigns_updated;
END;
$$;

-- Permissões
GRANT EXECUTE ON FUNCTION public.auto_assign_campaign_funnels() TO service_role;
GRANT EXECUTE ON FUNCTION public.auto_assign_campaign_funnels() TO authenticated;
