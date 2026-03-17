-- ═══════════════════════════════════════════════════════════════════
-- VIEW: v_all_sales — FASE 1: apenas ticto_transactions (estado seguro)
-- customer_purchases será adicionado após correção de qualidade de dados
-- (process-import duplicava registros e possível erro de unidade nos CSVs)
-- ═══════════════════════════════════════════════════════════════════

CREATE OR REPLACE VIEW public.v_all_sales AS
  SELECT
    id,
    'ticto'::text                   AS platform,
    funnel_id,
    status,
    order_date::timestamptz         AS purchased_at,
    (paid_amount / 100.0)::numeric  AS revenue,
    product_name,
    offer_name,
    payment_method,
    customer_name,
    customer_email,
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
    is_paid_traffic
  FROM public.ticto_transactions;

-- Permissões (views não herdam RLS — precisam de GRANT explícito)
GRANT SELECT ON public.v_all_sales TO authenticated;
GRANT SELECT ON public.v_all_sales TO service_role;
