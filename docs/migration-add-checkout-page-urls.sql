-- ═══════════════════════════════════════════════════════════════════
-- MIGRATION: Adicionar checkout_url e page_url + recriar v_all_sales
-- Rodar no SQL Editor do Supabase Dashboard
-- ═══════════════════════════════════════════════════════════════════

-- ─── 1. Colunas em ticto_transactions ───
ALTER TABLE public.ticto_transactions
  ADD COLUMN IF NOT EXISTS checkout_url text,
  ADD COLUMN IF NOT EXISTS page_url text;

-- ─── 2. Colunas em customer_purchases ───
ALTER TABLE public.customer_purchases
  ADD COLUMN IF NOT EXISTS checkout_url text,
  ADD COLUMN IF NOT EXISTS page_url text;

-- ─── 3. Recriar v_all_sales com os novos campos ───
DROP VIEW IF EXISTS public.v_all_sales;

CREATE OR REPLACE VIEW public.v_all_sales AS

  SELECT
    t.id,
    t.source_platform                  AS platform,
    t.funnel_id,
    t.status,
    COALESCE(t.order_date, t.created_at)::timestamptz AS purchased_at,
    (t.paid_amount / 100.0)::numeric   AS revenue,
    t.product_name,
    t.product_id::text                 AS product_id,
    t.offer_name,
    t.payment_method,
    t.customer_name,
    t.customer_email,
    t.customer_phone,
    NULL::uuid                         AS unified_customer_id,
    t.meta_campaign_id,
    t.meta_adset_id,
    t.meta_ad_id,
    t.meta_campaign_name,
    t.meta_adset_name,
    t.meta_ad_name,
    t.utm_source,
    t.utm_campaign,
    t.utm_medium,
    t.utm_content,
    t.is_paid_traffic,
    t.ingestion_type,
    t.affiliate_name,
    t.affiliate_commission,
    t.checkout_url,
    t.page_url
  FROM public.ticto_transactions t

  UNION ALL

  SELECT
    cp.id,
    cp.platform,
    cp.funnel_id,
    cp.status,
    cp.purchased_at,
    cp.gross_amount                    AS revenue,
    cp.product_name,
    cp.product_id,
    cp.offer_name,
    cp.payment_method,
    uc.full_name                       AS customer_name,
    uc.primary_email                   AS customer_email,
    uc.primary_phone                   AS customer_phone,
    cp.unified_customer_id,
    cp.meta_campaign_id,
    cp.meta_adset_id,
    cp.meta_ad_id,
    NULL::text                         AS meta_campaign_name,
    NULL::text                         AS meta_adset_name,
    NULL::text                         AS meta_ad_name,
    cp.utm_source,
    cp.utm_campaign,
    cp.utm_medium,
    cp.utm_content,
    (cp.meta_campaign_id IS NOT NULL)  AS is_paid_traffic,
    cp.ingestion_type,
    cp.affiliate_name,
    cp.affiliate_commission,
    cp.checkout_url,
    cp.page_url
  FROM public.customer_purchases cp
  LEFT JOIN public.unified_customers uc ON uc.id = cp.unified_customer_id
  WHERE cp.platform != 'ticto';

GRANT SELECT ON public.v_all_sales TO authenticated;
GRANT SELECT ON public.v_all_sales TO service_role;

-- ─── 4. Backfill: extrair URLs dos raw_payload existentes ───

-- Ticto: checkout_url e page_url de tracking e query_params
UPDATE public.ticto_transactions
SET
  checkout_url = COALESCE(
    raw_payload->'tracking'->>'checkout_url',
    raw_payload->>'checkout_url',
    raw_payload->>'checkout_page',
    raw_payload->'query_params'->>'checkout_url'
  ),
  page_url = COALESCE(
    raw_payload->'tracking'->>'page_url',
    raw_payload->'query_params'->>'page',
    raw_payload->>'page_url',
    raw_payload->>'page'
  )
WHERE raw_payload IS NOT NULL
  AND checkout_url IS NULL;

-- Customer purchases (Guru/Eduzz): checkout_url e page_url de raw_data
UPDATE public.customer_purchases
SET
  checkout_url = COALESCE(
    raw_data->'tracking'->>'checkout_url',
    raw_data->'sale'->>'checkout_url',
    raw_data->>'checkout_url',
    raw_data->'data'->'tracking'->>'checkout_url',
    raw_data->'data'->'invoice'->>'checkout_url',
    raw_data->'query_params'->>'checkout_url'
  ),
  page_url = COALESCE(
    raw_data->'tracking'->>'page_url',
    raw_data->'query_params'->>'page',
    raw_data->>'page_url',
    raw_data->'data'->'tracking'->>'page_url',
    raw_data->'data'->>'page_url'
  )
WHERE raw_data IS NOT NULL
  AND checkout_url IS NULL;
