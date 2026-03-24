-- ============================================================
-- Automações WhatsApp — wz_* tables
-- Rodar no Supabase SQL Editor
-- ============================================================

CREATE TABLE IF NOT EXISTS public.wz_instances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  api_url text NOT NULL,
  api_key text NOT NULL,
  status text NOT NULL DEFAULT 'disconnected',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.wz_instances ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated read wz_instances" ON public.wz_instances FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated write wz_instances" ON public.wz_instances FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS public.wz_flows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL DEFAULT 'Novo Fluxo',
  description text,
  platform text DEFAULT 'any',
  product_filter text,
  is_active boolean NOT NULL DEFAULT false,
  nodes jsonb NOT NULL DEFAULT '[]',
  edges jsonb NOT NULL DEFAULT '[]',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.wz_flows ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated full wz_flows" ON public.wz_flows FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS public.wz_executions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  flow_id uuid NOT NULL REFERENCES public.wz_flows(id) ON DELETE CASCADE,
  contact_phone text,
  contact_name text,
  contact_email text,
  trigger_event text,
  trigger_payload jsonb,
  variables jsonb DEFAULT '{}',
  status text NOT NULL DEFAULT 'running',
  current_node_id text,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz
);
ALTER TABLE public.wz_executions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated read wz_executions" ON public.wz_executions FOR SELECT TO authenticated USING (true);
CREATE POLICY "Service write wz_executions" ON public.wz_executions FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS public.wz_scheduled_steps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  execution_id uuid NOT NULL REFERENCES public.wz_executions(id) ON DELETE CASCADE,
  node_id text NOT NULL,
  run_at timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.wz_scheduled_steps ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service full wz_scheduled_steps" ON public.wz_scheduled_steps FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated read wz_scheduled_steps" ON public.wz_scheduled_steps FOR SELECT TO authenticated USING (true);
CREATE INDEX IF NOT EXISTS idx_wz_scheduled_run_at ON public.wz_scheduled_steps(run_at) WHERE status = 'pending';
