-- ═══════════════════════════════════════════════════════════════════
-- RPC: auto_assign_campaign_funnels (v2) — agora versionado em migration
-- (antes vivia só em docs/auto-assign-campaign-funnels.sql, aplicado à mão)
--
-- Vincula campanhas/adsets/ads a funis:
--   1.  por keyword de funnel_products (corrige funnel_id errado);
--   1b. fallback pelo nome-base do funil ("Articulabem - 1" → "Articulabem");
--       FIX: regex do sufixo numérico usava barra dupla ('\\s*...') e nunca
--       casava — corrigido para '\s*-\s*\d+\s*$';
--   1c. NOVO: conta usada por exatamente 1 funil ativo → campanhas ainda
--       sem funil herdam esse funil (cobre nomes sem keyword e funis novos
--       como o Renda Natural, sem depender do nome da campanha);
--   2/3. propaga funnel_id para meta_adsets e meta_ads.
-- ═══════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.auto_assign_campaign_funnels()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  campaigns_updated integer := 0;
  step_updated      integer := 0;
  adsets_updated    integer := 0;
  ads_updated       integer := 0;
BEGIN
  -- 1. Match por keywords dos funnel_products, mesmo quando já têm funnel_id.
  --    Corrige contas compartilhadas onde a campanha grudou no funil errado.
  --    Prioriza o match mais longo (mais específico).
  UPDATE meta_campaigns mc
  SET funnel_id = matched.funnel_id
  FROM (
    SELECT DISTINCT ON (mc2.id)
      mc2.id AS campaign_id,
      f.id   AS funnel_id
    FROM meta_campaigns mc2
    CROSS JOIN funnels f
    JOIN funnel_products fp ON fp.funnel_id = f.id
    WHERE f.is_active = true
      AND f.meta_account_id IS NOT NULL
      AND mc2.account_id = ANY(string_to_array(replace(replace(f.meta_account_id, 'act_', ''), ' ', ''), ','))
      AND length(fp.product_name_contains) >= 3
      AND mc2.name ILIKE '%' || fp.product_name_contains || '%'
    ORDER BY mc2.id, length(fp.product_name_contains) DESC
  ) matched
  WHERE mc.id = matched.campaign_id
    AND (mc.funnel_id IS NULL OR mc.funnel_id != matched.funnel_id);

  GET DIAGNOSTICS campaigns_updated = ROW_COUNT;

  -- 1b. Fallback: match pelo nome-base do funil (ex: "Articulabem - 1" => "Articulabem")
  UPDATE meta_campaigns mc
  SET funnel_id = matched.funnel_id
  FROM (
    SELECT DISTINCT ON (mc2.id)
      mc2.id AS campaign_id,
      f.id   AS funnel_id
    FROM meta_campaigns mc2
    CROSS JOIN funnels f
    WHERE f.is_active = true
      AND f.meta_account_id IS NOT NULL
      AND mc2.account_id = ANY(string_to_array(replace(replace(f.meta_account_id, 'act_', ''), ' ', ''), ','))
      AND length(trim(regexp_replace(f.name, '\s*-\s*\d+\s*$', '', 'i'))) >= 3
      AND mc2.name ILIKE '%' || trim(regexp_replace(f.name, '\s*-\s*\d+\s*$', '', 'i')) || '%'
    ORDER BY mc2.id, length(trim(regexp_replace(f.name, '\s*-\s*\d+\s*$', '', 'i'))) DESC
  ) matched
  WHERE mc.id = matched.campaign_id
    AND (mc.funnel_id IS NULL OR mc.funnel_id != matched.funnel_id);

  GET DIAGNOSTICS step_updated = ROW_COUNT;
  campaigns_updated := campaigns_updated + step_updated;

  -- 1c. Conta usada por exatamente 1 funil ativo: campanhas ainda sem funil
  --     herdam esse funil (não depende do nome da campanha).
  UPDATE meta_campaigns mc
  SET funnel_id = s.funnel_id
  FROM (
    SELECT account_id, (array_agg(funnel_id))[1] AS funnel_id
    FROM (
      SELECT DISTINCT trim(acct) AS account_id, f.id AS funnel_id
      FROM funnels f,
           unnest(string_to_array(replace(replace(f.meta_account_id, 'act_', ''), ' ', ''), ',')) AS acct
      WHERE f.is_active = true
        AND f.meta_account_id IS NOT NULL
        AND trim(acct) <> ''
    ) owners
    GROUP BY account_id
    HAVING count(DISTINCT funnel_id) = 1
  ) s
  WHERE mc.account_id = s.account_id
    AND mc.funnel_id IS NULL;

  GET DIAGNOSTICS step_updated = ROW_COUNT;
  campaigns_updated := campaigns_updated + step_updated;

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

GRANT EXECUTE ON FUNCTION public.auto_assign_campaign_funnels() TO service_role;
GRANT EXECUTE ON FUNCTION public.auto_assign_campaign_funnels() TO authenticated;
