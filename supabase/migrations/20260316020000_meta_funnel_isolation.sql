-- ═══════════════════════════════════════════════════════════════════
-- Meta Funnel Isolation
--
-- PROBLEMA: meta_campaigns, meta_adsets e meta_ads não tinham funnel_id.
-- Todos os hooks Meta retornavam dados globais — de todos os funis —
-- mesmo quando acessados pela página de um funil específico.
--
-- SOLUÇÃO:
--   1. Adicionar funnel_id (nullable) nas três tabelas
--   2. Auto-popular via funnels.meta_account_id = campaigns.account_id
--   3. Propagar campaign.funnel_id → adset.funnel_id → ad.funnel_id
--   4. Trigger: novos registros já entram com funnel_id correto
--   5. Função utilitária tag_meta_campaigns_funnel() para re-taggear
--
-- ROLLBACK:
--   DROP TRIGGER IF EXISTS trg_auto_tag_meta_campaign ON public.meta_campaigns;
--   DROP FUNCTION IF EXISTS public.auto_tag_meta_campaign_funnel();
--   DROP FUNCTION IF EXISTS public.tag_meta_campaigns_funnel();
--   ALTER TABLE public.meta_campaigns  DROP COLUMN IF EXISTS funnel_id;
--   ALTER TABLE public.meta_adsets     DROP COLUMN IF EXISTS funnel_id;
--   ALTER TABLE public.meta_ads        DROP COLUMN IF EXISTS funnel_id;
-- ═══════════════════════════════════════════════════════════════════

-- ── 1. Adicionar funnel_id (nullable) ─────────────────────────────
ALTER TABLE public.meta_campaigns
  ADD COLUMN IF NOT EXISTS funnel_id uuid
  REFERENCES public.funnels(id) ON DELETE SET NULL;

ALTER TABLE public.meta_adsets
  ADD COLUMN IF NOT EXISTS funnel_id uuid
  REFERENCES public.funnels(id) ON DELETE SET NULL;

ALTER TABLE public.meta_ads
  ADD COLUMN IF NOT EXISTS funnel_id uuid
  REFERENCES public.funnels(id) ON DELETE SET NULL;

-- ── 2. Índices para filtro por funil ──────────────────────────────
CREATE INDEX IF NOT EXISTS idx_meta_campaigns_funnel
  ON public.meta_campaigns(funnel_id)
  WHERE funnel_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_meta_adsets_funnel
  ON public.meta_adsets(funnel_id)
  WHERE funnel_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_meta_ads_funnel
  ON public.meta_ads(funnel_id)
  WHERE funnel_id IS NOT NULL;

-- ── 3. Auto-popular campaigns via account_id ──────────────────────
-- funnels.meta_account_id = meta_campaigns.account_id (fonte de verdade)
UPDATE public.meta_campaigns c
SET funnel_id = f.id
FROM public.funnels f
WHERE f.meta_account_id IS NOT NULL
  AND f.meta_account_id = c.account_id;

-- ── 4. Propagar funnel_id: campaigns → adsets ─────────────────────
UPDATE public.meta_adsets a
SET funnel_id = c.funnel_id
FROM public.meta_campaigns c
WHERE a.campaign_id = c.id
  AND c.funnel_id IS NOT NULL
  AND (a.funnel_id IS NULL OR a.funnel_id != c.funnel_id);

-- ── 5. Propagar funnel_id: adsets → ads ───────────────────────────
UPDATE public.meta_ads ad
SET funnel_id = a.funnel_id
FROM public.meta_adsets a
WHERE ad.adset_id = a.id
  AND a.funnel_id IS NOT NULL
  AND (ad.funnel_id IS NULL OR ad.funnel_id != a.funnel_id);

-- ── 6. Trigger: auto-taggear novos registros ao inserir ───────────
CREATE OR REPLACE FUNCTION public.auto_tag_meta_campaign_funnel()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  SELECT id INTO NEW.funnel_id
  FROM public.funnels
  WHERE meta_account_id = NEW.account_id
  LIMIT 1;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_auto_tag_meta_campaign ON public.meta_campaigns;
CREATE TRIGGER trg_auto_tag_meta_campaign
  BEFORE INSERT OR UPDATE OF account_id ON public.meta_campaigns
  FOR EACH ROW EXECUTE FUNCTION public.auto_tag_meta_campaign_funnel();

-- ── 7. Função utilitária: re-taggear manualmente se necessário ─────
-- Executar manualmente: SELECT tag_meta_campaigns_funnel();
CREATE OR REPLACE FUNCTION public.tag_meta_campaigns_funnel()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_campaigns int := 0;
  v_adsets    int := 0;
  v_ads       int := 0;
BEGIN
  WITH updated AS (
    UPDATE public.meta_campaigns c
    SET funnel_id = f.id
    FROM public.funnels f
    WHERE f.meta_account_id IS NOT NULL
      AND f.meta_account_id = c.account_id
      AND (c.funnel_id IS NULL OR c.funnel_id != f.id)
    RETURNING 1
  )
  SELECT COUNT(*) INTO v_campaigns FROM updated;

  WITH updated AS (
    UPDATE public.meta_adsets a
    SET funnel_id = c.funnel_id
    FROM public.meta_campaigns c
    WHERE a.campaign_id = c.id
      AND c.funnel_id IS NOT NULL
      AND (a.funnel_id IS NULL OR a.funnel_id != c.funnel_id)
    RETURNING 1
  )
  SELECT COUNT(*) INTO v_adsets FROM updated;

  WITH updated AS (
    UPDATE public.meta_ads ad
    SET funnel_id = a.funnel_id
    FROM public.meta_adsets a
    WHERE ad.adset_id = a.id
      AND a.funnel_id IS NOT NULL
      AND (ad.funnel_id IS NULL OR ad.funnel_id != a.funnel_id)
    RETURNING 1
  )
  SELECT COUNT(*) INTO v_ads FROM updated;

  RETURN jsonb_build_object(
    'campaigns_tagged', v_campaigns,
    'adsets_tagged',    v_adsets,
    'ads_tagged',       v_ads
  );
END;
$$;

COMMENT ON FUNCTION public.tag_meta_campaigns_funnel() IS
  'Re-tageia meta_campaigns/adsets/ads com funnel_id baseado em funnels.meta_account_id. '
  'Executar manualmente se necessário: SELECT tag_meta_campaigns_funnel();';

GRANT EXECUTE ON FUNCTION public.tag_meta_campaigns_funnel() TO authenticated;
GRANT EXECUTE ON FUNCTION public.tag_meta_campaigns_funnel() TO service_role;
GRANT EXECUTE ON FUNCTION public.auto_tag_meta_campaign_funnel() TO authenticated;
GRANT EXECUTE ON FUNCTION public.auto_tag_meta_campaign_funnel() TO service_role;
