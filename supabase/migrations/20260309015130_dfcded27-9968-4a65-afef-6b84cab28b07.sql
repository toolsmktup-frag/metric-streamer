
-- Table to store Ticto webhook transactions
CREATE TABLE public.ticto_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Ticto order data
  order_id integer,
  order_hash text,
  transaction_hash text UNIQUE,
  status text NOT NULL,
  status_date timestamptz,
  payment_method text,
  paid_amount numeric NOT NULL DEFAULT 0,  -- in centavos from Ticto
  installments integer,
  order_date timestamptz,
  -- Product/offer
  product_name text,
  product_id integer,
  offer_name text,
  offer_id text,
  offer_code text,
  -- Customer
  customer_name text,
  customer_email text,
  customer_phone text,
  customer_code text,
  -- Raw tracking/UTMs
  utm_source text,
  utm_medium text,
  utm_campaign text,
  utm_content text,
  utm_term text,
  src text,
  sck text,
  -- Parsed Meta Ads IDs (extracted from UTMs like "campaign_name|campaign_id")
  meta_campaign_id text,
  meta_campaign_name text,
  meta_adset_id text,
  meta_adset_name text,
  meta_ad_id text,
  meta_ad_name text,
  -- Flags
  is_paid_traffic boolean NOT NULL DEFAULT false,
  -- Raw payload for debugging
  raw_payload jsonb,
  -- Timestamps
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Index for fast lookups by Meta campaign hierarchy
CREATE INDEX idx_ticto_meta_campaign ON public.ticto_transactions(meta_campaign_id);
CREATE INDEX idx_ticto_meta_adset ON public.ticto_transactions(meta_adset_id);
CREATE INDEX idx_ticto_meta_ad ON public.ticto_transactions(meta_ad_id);
CREATE INDEX idx_ticto_status ON public.ticto_transactions(status);
CREATE INDEX idx_ticto_order_date ON public.ticto_transactions(order_date);
CREATE INDEX idx_ticto_is_paid ON public.ticto_transactions(is_paid_traffic);

-- RLS
ALTER TABLE public.ticto_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated read" ON public.ticto_transactions
  AS PERMISSIVE FOR SELECT TO authenticated USING (true);

-- Service role needs INSERT/UPDATE for the edge function
CREATE POLICY "Service insert" ON public.ticto_transactions
  AS PERMISSIVE FOR INSERT TO service_role WITH CHECK (true);

CREATE POLICY "Service update" ON public.ticto_transactions
  AS PERMISSIVE FOR UPDATE TO service_role USING (true) WITH CHECK (true);
