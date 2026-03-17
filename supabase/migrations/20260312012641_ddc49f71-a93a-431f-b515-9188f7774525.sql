
-- Campaign change log table to track budget, status, creative changes
CREATE TABLE public.campaign_change_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  entity_type text NOT NULL, -- 'campaign', 'adset', 'ad'
  entity_id text NOT NULL,
  entity_name text,
  field_changed text NOT NULL, -- 'status', 'daily_budget', 'name', etc.
  old_value text,
  new_value text,
  detected_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.campaign_change_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated read change_log" ON public.campaign_change_log
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Service full access change_log" ON public.campaign_change_log
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Index for quick lookups
CREATE INDEX idx_change_log_entity ON public.campaign_change_log(entity_type, entity_id);
CREATE INDEX idx_change_log_date ON public.campaign_change_log(detected_at DESC);
