-- ═══════════════════════════════════════════════════════════════════
-- FIX: Pipeline Guia de Tinturas — multi-account meta tag + backfill
-- Rodar no SQL Editor do Supabase Dashboard
-- ═══════════════════════════════════════════════════════════════════

-- ── 1. Corrigir trigger para suportar meta_account_id com múltiplos valores ──
CREATE OR REPLACE FUNCTION public.auto_tag_meta_campaign_funnel()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  SELECT f.id INTO NEW.funnel_id
  FROM public.funnels f
  WHERE f.meta_account_id IS NOT NULL
    AND NEW.account_id = ANY(
      string_to_array(replace(f.meta_account_id, ' ', ''), ',')
    )
  LIMIT 1;
  RETURN NEW;
END;
$$;

-- ── 2. Corrigir função utilitária tag_meta_campaigns_funnel ──
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
      AND c.account_id = ANY(
        string_to_array(replace(f.meta_account_id, ' ', ''), ',')
      )
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

-- ── 3. Backfill ticto_transactions do Guia de Tinturas ──
UPDATE ticto_transactions t
SET
  paid_amount = COALESCE(
    NULLIF(t.paid_amount, 0),
    NULLIF((raw_payload->'data'->'invoice'->>'paid_amount')::numeric, 0),
    NULLIF((raw_payload->'data'->'invoice'->>'amount')::numeric, 0),
    NULLIF((raw_payload->'data'->'invoice'->>'total')::numeric, 0),
    NULLIF((raw_payload->'data'->'invoice'->>'value')::numeric, 0),
    NULLIF((raw_payload->'item'->>'amount')::numeric, 0),
    NULLIF((raw_payload->'item'->>'total_value')::numeric, 0),
    NULLIF((raw_payload->'data'->>'paid_amount')::numeric, 0),
    NULLIF((raw_payload->>'paid_amount')::numeric, 0),
    t.paid_amount
  ),
  product_name = COALESCE(
    NULLIF(t.product_name, ''),
    NULLIF(raw_payload->'data'->'invoice'->>'product_name', ''),
    NULLIF(raw_payload->'data'->'invoice'->'product'->>'name', ''),
    NULLIF(raw_payload->'item'->>'product_name', ''),
    NULLIF(raw_payload->'item'->>'name', ''),
    NULLIF(raw_payload->'item'->'product'->>'name', ''),
    NULLIF(raw_payload->'data'->>'product_name', ''),
    NULLIF(raw_payload->>'product_name', ''),
    t.product_name
  ),
  status = CASE
    WHEN t.status IN ('open', '') OR t.status IS NULL THEN
      CASE
        WHEN LOWER(COALESCE(
          raw_payload->'data'->'invoice'->>'status',
          raw_payload->'data'->>'status',
          raw_payload->>'status', ''
        )) IN ('approved', 'authorized', 'paid') THEN 'authorized'
        WHEN LOWER(COALESCE(
          raw_payload->'data'->'invoice'->>'status',
          raw_payload->'data'->>'status',
          raw_payload->>'status', ''
        )) IN ('pix_created', 'bank_slip_created', 'pending', 'waiting_payment') THEN 'pending'
        ELSE t.status
      END
    ELSE t.status
  END,
  order_id = COALESCE(
    t.order_id,
    (raw_payload->'data'->'invoice'->>'id')::bigint,
    (raw_payload->'data'->>'id')::bigint
  ),
  updated_at = NOW()
WHERE funnel_id = '10000000-0000-0000-0000-000000000001'
  AND (
    paid_amount = 0 OR paid_amount IS NULL
    OR product_name IS NULL OR product_name = ''
    OR status = 'open' OR status IS NULL OR status = ''
  );

-- ── 4. Re-taggear campanhas Meta com a lógica corrigida ──
SELECT tag_meta_campaigns_funnel();

-- ── 5. Re-executar auto_assign por keywords ──
SELECT auto_assign_campaign_funnels();
