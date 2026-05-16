-- ═══════════════════════════════════════════════════════════════════
-- MIGRATION: Marcar origem da conta Guru (Soulnaturi vs Articulabem)
-- Rodar manualmente no Supabase Dashboard → SQL Editor
-- Data: 2026-05-16
-- ═══════════════════════════════════════════════════════════════════

-- ─── 1. Tabela de mapeamento das contas Guru ───
CREATE TABLE IF NOT EXISTS public.guru_accounts (
  api_token     text PRIMARY KEY,
  account_slug  text UNIQUE NOT NULL,
  display_name  text NOT NULL,
  color         text NOT NULL DEFAULT 'hsl(220 70% 50%)',
  created_at    timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.guru_accounts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated can read guru_accounts" ON public.guru_accounts;
CREATE POLICY "Authenticated can read guru_accounts"
  ON public.guru_accounts FOR SELECT
  TO authenticated USING (true);

-- ─── 2. Seed das 2 contas conhecidas ───
INSERT INTO public.guru_accounts (api_token, account_slug, display_name, color) VALUES
  ('9fmDLyGxbcXGqcZyTJb8Kcb1BjhY8xwfrEprE7t6', 'soulnaturi',  'Soulnaturi',  'hsl(142 71% 45%)'),
  ('O3yB6USrrplTojFXy7jltjhviNujOHUE35ITGYjz', 'articulabem', 'Articulabem', 'hsl(262 83% 58%)')
ON CONFLICT (api_token) DO NOTHING;

-- ─── 3. Coluna em customer_purchases ───
ALTER TABLE public.customer_purchases
  ADD COLUMN IF NOT EXISTS guru_account_slug text;

CREATE INDEX IF NOT EXISTS idx_customer_purchases_guru_account
  ON public.customer_purchases(guru_account_slug);

-- ─── 4. Backfill: popula a partir do raw_data->>'api_token' ───
UPDATE public.customer_purchases cp
SET guru_account_slug = ga.account_slug
FROM public.guru_accounts ga
WHERE cp.platform = 'guru'
  AND cp.raw_data->>'api_token' = ga.api_token
  AND (cp.guru_account_slug IS NULL OR cp.guru_account_slug <> ga.account_slug);

-- ─── 5. Atualizar v_all_sales para expor guru_account_slug + guru_account_name ───
DROP VIEW IF EXISTS public.v_all_sales;

CREATE VIEW public.v_all_sales AS
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
    NULL::text                         AS guru_account_slug,
    NULL::text                         AS guru_account_name
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
    cp.guru_account_slug,
    ga.display_name                    AS guru_account_name
  FROM public.customer_purchases cp
  LEFT JOIN public.unified_customers uc ON uc.id = cp.unified_customer_id
  LEFT JOIN public.guru_accounts ga ON ga.account_slug = cp.guru_account_slug
  WHERE cp.platform != 'ticto';

GRANT SELECT ON public.v_all_sales TO authenticated;
GRANT SELECT ON public.v_all_sales TO service_role;

-- ─── 6. Backfill lead.metadata.guru_account (opcional, ajuda Kanban/timeline) ───
UPDATE public.leads l
SET metadata = COALESCE(l.metadata, '{}'::jsonb)
             || jsonb_build_object('guru_account', sub.account_slug)
FROM (
  SELECT DISTINCT ON (le.lead_id)
    le.lead_id,
    cp.guru_account_slug AS account_slug
  FROM public.lead_events le
  JOIN public.customer_purchases cp
    ON cp.platform = 'guru'
   AND cp.platform_transaction_id = (le.metadata->>'transaction_id')
  WHERE cp.guru_account_slug IS NOT NULL
  ORDER BY le.lead_id, le.created_at DESC
) AS sub
WHERE l.id = sub.lead_id;
