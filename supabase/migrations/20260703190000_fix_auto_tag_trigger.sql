-- ═══════════════════════════════════════════════════════════════════
-- FIX: trigger auto_tag_meta_campaign_funnel sobrescrevia funnel_id
--
-- Problema (incidente 03/07): o trigger rodava em INSERT e em
-- UPDATE OF account_id, com match EXATO (sem tratar act_/vírgula) e
-- LIMIT 1 sem ORDER BY. Como o sync-meta faz upsert de TODAS as
-- campanhas a cada execução, o trigger re-carimbava todas as campanhas
-- da conta compartilhada 1231475274603801 para um funil arbitrário
-- (Clube Secreto, INATIVO), desfazendo vínculos manuais e do RPC.
--
-- Novo comportamento:
--   • roda apenas em INSERT e apenas quando funnel_id vem NULL;
--   • normaliza meta_account_id (act_, espaços, lista com vírgula);
--   • considera só funis ativos e só atribui quando EXATAMENTE UM
--     funil ativo usa a conta — ambiguidade fica NULL para o RPC
--     auto_assign_campaign_funnels ou o vínculo manual resolverem.
-- ═══════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.auto_tag_meta_campaign_funnel()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_funnel_ids uuid[];
BEGIN
  -- Nunca sobrescreve vínculo já existente
  IF NEW.funnel_id IS NOT NULL THEN
    RETURN NEW;
  END IF;

  SELECT array_agg(DISTINCT f.id)
    INTO v_funnel_ids
  FROM public.funnels f
  WHERE f.is_active = true
    AND f.meta_account_id IS NOT NULL
    AND NEW.account_id = ANY(
      string_to_array(replace(replace(f.meta_account_id, 'act_', ''), ' ', ''), ',')
    );

  IF array_length(v_funnel_ids, 1) = 1 THEN
    NEW.funnel_id := v_funnel_ids[1];
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_auto_tag_meta_campaign ON public.meta_campaigns;
CREATE TRIGGER trg_auto_tag_meta_campaign
  BEFORE INSERT ON public.meta_campaigns
  FOR EACH ROW EXECUTE FUNCTION public.auto_tag_meta_campaign_funnel();

-- ── tag_meta_campaigns_funnel(): mesmo problema (match exato +
--    sobrescrita). Reescrita com as mesmas regras do trigger:
--    só preenche funnel_id NULL, só conta com 1 funil ativo. ──
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
  WITH owners AS (
    SELECT trim(acct) AS account_id, f.id AS funnel_id
    FROM public.funnels f,
         unnest(string_to_array(replace(replace(f.meta_account_id, 'act_', ''), ' ', ''), ',')) AS acct
    WHERE f.is_active = true
      AND f.meta_account_id IS NOT NULL
      AND trim(acct) <> ''
  ),
  single_owner AS (
    SELECT account_id, (array_agg(funnel_id))[1] AS funnel_id
    FROM owners
    GROUP BY account_id
    HAVING count(DISTINCT funnel_id) = 1
  ),
  updated AS (
    UPDATE public.meta_campaigns c
    SET funnel_id = s.funnel_id
    FROM single_owner s
    WHERE c.account_id = s.account_id
      AND c.funnel_id IS NULL
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

COMMENT ON FUNCTION public.auto_tag_meta_campaign_funnel() IS
  'Auto-vincula campanha nova a funil quando a conta pertence a exatamente 1 funil ativo. '
  'Nunca sobrescreve funnel_id existente (fix incidente 03/07: sync re-carimbava tudo p/ funil inativo).';
