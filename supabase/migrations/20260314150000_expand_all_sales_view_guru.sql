-- ═══════════════════════════════════════════════════════════════════
-- VIEW: v_all_sales — FASE 2: Ticto + Eduzz (ticto_transactions)
--                              + Guru (customer_purchases)
--
-- ARQUITETURA:
--   ticto_transactions  → Ticto webhook, Ticto CSV, Eduzz CSV
--   customer_purchases  → Guru webhook + Guru CSV (platform = 'guru')
--
-- COLUNAS ausentes em customer_purchases → NULL tipado explicitamente:
--   customer_name, customer_email, meta_*_name, is_paid_traffic
--   (is_paid_traffic derivado de meta_campaign_id IS NOT NULL)
-- ═══════════════════════════════════════════════════════════════════

CREATE OR REPLACE VIEW public.v_all_sales AS

  -- ── Ticto (webhook + CSV) e Eduzz (CSV) ──────────────────────────
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
  FROM public.ticto_transactions

  UNION ALL

  -- ── Guru (webhook + CSV) ─────────────────────────────────────────
  SELECT
    id,
    platform,
    funnel_id,
    status,
    purchased_at,
    gross_amount                    AS revenue,
    product_name,
    offer_name,
    payment_method,
    NULL::text                      AS customer_name,
    NULL::text                      AS customer_email,
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
    (meta_campaign_id IS NOT NULL)  AS is_paid_traffic
  FROM public.customer_purchases
  WHERE platform = 'guru';

-- Permissões
GRANT SELECT ON public.v_all_sales TO authenticated;
GRANT SELECT ON public.v_all_sales TO service_role;
