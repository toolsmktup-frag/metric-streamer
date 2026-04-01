-- Migration: Add product_id column to funnel_products
-- Execute on Supabase Dashboard SQL Editor
-- Date: 2026-04-01

-- 1. Add product_id column to funnel_products
ALTER TABLE public.funnel_products 
ADD COLUMN IF NOT EXISTS product_id text DEFAULT NULL;

COMMENT ON COLUMN public.funnel_products.product_id IS 'Product ID from the payment platform (Ticto, Guru, etc.) for exact matching';

-- 2. Update v_all_sales to include product_id from both tables
CREATE OR REPLACE VIEW public.v_all_sales AS

  -- Ticto (webhook + CSV) e Eduzz (CSV)
  SELECT
    id,
    'ticto'::text                   AS platform,
    funnel_id,
    status,
    order_date::timestamptz         AS purchased_at,
    (paid_amount / 100.0)::numeric  AS revenue,
    product_name,
    product_id::text                AS product_id,
    offer_name,
    payment_method,
    customer_name,
    customer_email,
    customer_phone,
    unified_customer_id,
    meta_campaign_id,
    meta_adset_id,
    meta_ad_id,
    meta_campaign_name,
    meta_adset_name,
    meta_ad_name,
    utm_source,
    utm_campaign,
    utm_medium,
    utm_content,
    is_paid_traffic,
    ingestion_type
  FROM public.ticto_transactions

  UNION ALL

  -- Guru (webhook + CSV)
  SELECT
    id,
    platform,
    funnel_id,
    status,
    purchased_at,
    gross_amount                    AS revenue,
    product_name,
    product_id::text                AS product_id,
    offer_name,
    payment_method,
    NULL::text                      AS customer_name,
    NULL::text                      AS customer_email,
    customer_phone,
    unified_customer_id,
    meta_campaign_id,
    meta_adset_id,
    meta_ad_id,
    NULL::text                      AS meta_campaign_name,
    NULL::text                      AS meta_adset_name,
    NULL::text                      AS meta_ad_name,
    utm_source,
    utm_campaign,
    utm_medium,
    utm_content,
    (meta_campaign_id IS NOT NULL)  AS is_paid_traffic,
    ingestion_type
  FROM public.customer_purchases
  WHERE platform = 'guru';

-- Permissões
GRANT SELECT ON public.v_all_sales TO authenticated;
GRANT SELECT ON public.v_all_sales TO service_role;
