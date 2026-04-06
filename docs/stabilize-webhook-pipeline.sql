-- ═══════════════════════════════════════════════════════════════════
-- STABILIZE WEBHOOK PIPELINE — Rodar no SQL Editor do Supabase
-- Cria webhook_audit + adiciona colunas faltantes + recria v_all_sales
-- ═══════════════════════════════════════════════════════════════════

-- ─── 1. CRIAR webhook_audit (a tabela NÃO EXISTE e o webhook falha silenciosamente) ───
CREATE TABLE IF NOT EXISTS public.webhook_audit (
  id                bigserial PRIMARY KEY,
  source            text,
  webhook_token     text,
  funnel_id         uuid,
  order_id          bigint,
  product_id        bigint,
  raw_status        text,
  normalized_status text,
  paid_amount       numeric,
  product_name      text,
  error_message     text,
  raw_payload       jsonb,
  processing_ms     int,
  created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_webhook_audit_source ON public.webhook_audit(source);
CREATE INDEX IF NOT EXISTS idx_webhook_audit_created ON public.webhook_audit(created_at DESC);

ALTER TABLE public.webhook_audit ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service full access webhook_audit"
  ON public.webhook_audit FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE POLICY "Authenticated read webhook_audit"
  ON public.webhook_audit FOR SELECT TO authenticated USING (true);

GRANT ALL ON public.webhook_audit TO service_role;
GRANT SELECT ON public.webhook_audit TO authenticated;

-- ─── 2. Colunas faltantes em ticto_transactions ───
ALTER TABLE public.ticto_transactions
  ADD COLUMN IF NOT EXISTS source_platform text NOT NULL DEFAULT 'ticto',
  ADD COLUMN IF NOT EXISTS ingestion_type text NOT NULL DEFAULT 'webhook',
  ADD COLUMN IF NOT EXISTS affiliate_name text,
  ADD COLUMN IF NOT EXISTS affiliate_commission numeric;

-- ─── 3. Colunas faltantes em customer_purchases ───
ALTER TABLE public.customer_purchases
  ADD COLUMN IF NOT EXISTS ingestion_type text NOT NULL DEFAULT 'webhook',
  ADD COLUMN IF NOT EXISTS affiliate_name text,
  ADD COLUMN IF NOT EXISTS affiliate_commission numeric;

-- ─── 4. Recriar v_all_sales com todos os campos consumidos pelo frontend ───
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

-- ─── 5. Backfill: re-taggear funnel_id nas ticto_transactions existentes ───
SELECT tag_meta_campaigns_funnel();

-- ─── 6. Backfill affiliate_name de ticto (raw_payload) ───
UPDATE public.ticto_transactions
SET affiliate_name = raw_payload->'affiliations'->0->>'contact_name'
WHERE raw_payload IS NOT NULL
  AND raw_payload->'affiliations'->0->>'contact_name' IS NOT NULL
  AND affiliate_name IS NULL;

-- ─── 7. Backfill Guia de Tinturas: corrigir status/valores zerados ───
UPDATE ticto_transactions t
SET
  paid_amount = COALESCE(
    NULLIF(t.paid_amount, 0),
    NULLIF((raw_payload->'data'->'invoice'->>'paid_amount')::numeric, 0),
    NULLIF((raw_payload->'data'->'invoice'->>'amount')::numeric, 0),
    NULLIF((raw_payload->'data'->'invoice'->>'total')::numeric, 0),
    t.paid_amount
  ),
  product_name = COALESCE(
    NULLIF(t.product_name, ''),
    NULLIF(raw_payload->'data'->'invoice'->>'product_name', ''),
    NULLIF(raw_payload->'data'->'invoice'->'product'->>'name', ''),
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
        )) IN ('pix_created', 'pending', 'waiting_payment') THEN 'pending'
        ELSE t.status
      END
    ELSE t.status
  END,
  updated_at = NOW()
WHERE funnel_id = '10000000-0000-0000-0000-000000000001'
  AND (
    paid_amount = 0 OR paid_amount IS NULL
    OR product_name IS NULL OR product_name = ''
    OR status = 'open' OR status IS NULL OR status = ''
  );
