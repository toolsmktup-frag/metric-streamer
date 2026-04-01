-- ═══════════════════════════════════════════════════════════════════
-- Adiciona affiliate_name e affiliate_commission nas tabelas + view
-- Rodar no SQL Editor do Supabase Dashboard
-- ═══════════════════════════════════════════════════════════════════

-- 1. Colunas novas
ALTER TABLE public.ticto_transactions
  ADD COLUMN IF NOT EXISTS affiliate_name TEXT,
  ADD COLUMN IF NOT EXISTS affiliate_commission NUMERIC;

ALTER TABLE public.customer_purchases
  ADD COLUMN IF NOT EXISTS affiliate_name TEXT,
  ADD COLUMN IF NOT EXISTS affiliate_commission NUMERIC;

-- 2. Backfill Ticto (raw_payload → affiliations[0].contact_name)
UPDATE public.ticto_transactions
SET affiliate_name = raw_payload->'affiliations'->0->>'contact_name'
WHERE raw_payload IS NOT NULL
  AND raw_payload->'affiliations'->0->>'contact_name' IS NOT NULL
  AND affiliate_name IS NULL;

-- 3. Backfill Guru (raw_data → affiliations[0])
UPDATE public.customer_purchases
SET
  affiliate_name = raw_data->'affiliations'->0->>'contact_name',
  affiliate_commission = (raw_data->'affiliations'->0->'commission'->>'amount')::numeric
WHERE raw_data IS NOT NULL
  AND raw_data->'affiliations'->0->>'contact_name' IS NOT NULL
  AND affiliate_name IS NULL;

-- 4. Recriar view com affiliate_name
DROP VIEW IF EXISTS public.v_all_sales;

CREATE OR REPLACE VIEW public.v_all_sales AS

  SELECT
    t.id,
    t.source_platform                  AS platform,
    t.funnel_id,
    t.status,
    t.order_date::timestamptz          AS purchased_at,
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
    t.affiliate_commission
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
    cp.affiliate_commission
  FROM public.customer_purchases cp
  LEFT JOIN public.unified_customers uc ON uc.id = cp.unified_customer_id
  WHERE cp.platform != 'ticto';

GRANT SELECT ON public.v_all_sales TO authenticated;
GRANT SELECT ON public.v_all_sales TO service_role;
