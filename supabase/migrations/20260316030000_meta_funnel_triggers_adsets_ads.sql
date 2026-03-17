-- ═══════════════════════════════════════════════════════════════════
-- Triggers de auto-tagueamento de funnel_id para meta_adsets e meta_ads
--
-- meta_campaigns já tem trigger via account_id.
-- meta_adsets e meta_ads herdam funnel_id da campanha pai via campaign_id/adset_id.
-- ═══════════════════════════════════════════════════════════════════

-- ── Trigger para meta_adsets ───────────────────────────────────────
CREATE OR REPLACE FUNCTION public.auto_tag_meta_adset_funnel()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  SELECT funnel_id INTO NEW.funnel_id
  FROM public.meta_campaigns
  WHERE id = NEW.campaign_id
    AND funnel_id IS NOT NULL
  LIMIT 1;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_auto_tag_meta_adset ON public.meta_adsets;
CREATE TRIGGER trg_auto_tag_meta_adset
  BEFORE INSERT OR UPDATE OF campaign_id ON public.meta_adsets
  FOR EACH ROW EXECUTE FUNCTION public.auto_tag_meta_adset_funnel();

-- ── Trigger para meta_ads ──────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.auto_tag_meta_ad_funnel()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  SELECT funnel_id INTO NEW.funnel_id
  FROM public.meta_adsets
  WHERE id = NEW.adset_id
    AND funnel_id IS NOT NULL
  LIMIT 1;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_auto_tag_meta_ad ON public.meta_ads;
CREATE TRIGGER trg_auto_tag_meta_ad
  BEFORE INSERT OR UPDATE OF adset_id ON public.meta_ads
  FOR EACH ROW EXECUTE FUNCTION public.auto_tag_meta_ad_funnel();

GRANT EXECUTE ON FUNCTION public.auto_tag_meta_adset_funnel() TO authenticated;
GRANT EXECUTE ON FUNCTION public.auto_tag_meta_adset_funnel() TO service_role;
GRANT EXECUTE ON FUNCTION public.auto_tag_meta_ad_funnel() TO authenticated;
GRANT EXECUTE ON FUNCTION public.auto_tag_meta_ad_funnel() TO service_role;
