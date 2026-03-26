-- ═══════════════════════════════════════════════════════════════════
-- VIEW: v_all_sales — FASE 5: inclui ingestion_type (webhook vs import)
--
-- PRÉ-REQUISITOS (rodar antes no SQL Editor):
--   ALTER TABLE public.ticto_transactions ADD COLUMN IF NOT EXISTS ingestion_type text NOT NULL DEFAULT 'webhook';
--   ALTER TABLE public.customer_purchases ADD COLUMN IF NOT EXISTS ingestion_type text NOT NULL DEFAULT 'webhook';
--
-- Rodar no SQL Editor do Supabase Dashboard
-- ═══════════════════════════════════════════════════════════════════

DROP VIEW IF EXISTS public.v_all_sales;

CREATE OR REPLACE VIEW public.v_all_sales AS

  -- ── Ticto + Eduzz (via ticto_transactions) ──────────────────────
  SELECT
    t.id,
    t.source_platform                  AS platform,
    t.funnel_id,
    t.status,
    t.order_date::timestamptz          AS purchased_at,
    (t.paid_amount / 100.0)::numeric   AS revenue,
    t.product_name,
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
    t.ingestion_type
  FROM public.ticto_transactions t

  UNION ALL

  -- ── Guru + outras plataformas (via customer_purchases) ──────────
  SELECT
    cp.id,
    cp.platform,
    cp.funnel_id,
    cp.status,
    cp.purchased_at,
    cp.gross_amount                    AS revenue,
    cp.product_name,
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
    cp.ingestion_type
  FROM public.customer_purchases cp
  LEFT JOIN public.unified_customers uc ON uc.id = cp.unified_customer_id
  WHERE cp.platform != 'ticto';

-- Permissões
GRANT SELECT ON public.v_all_sales TO authenticated;
GRANT SELECT ON public.v_all_sales TO service_role;
