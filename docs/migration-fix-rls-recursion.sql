-- =============================================
-- FIX: RLS recursion in user_profiles + lead tables setup
-- Run this in Supabase Dashboard > SQL Editor
-- =============================================

-- 1. Create SECURITY DEFINER function to get current user's org_id
-- This bypasses RLS, breaking the infinite recursion cycle
CREATE OR REPLACE FUNCTION public.get_user_org_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT organization_id FROM public.user_profiles WHERE id = auth.uid()
$$;

-- 2. Create SECURITY DEFINER function to get current user's role
CREATE OR REPLACE FUNCTION public.get_user_role()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role FROM public.user_profiles WHERE id = auth.uid()
$$;

-- 3. Drop the recursive policy on user_profiles
DROP POLICY IF EXISTS "Admin reads org profiles" ON public.user_profiles;

-- 4. Recreate using the safe function (no recursion)
CREATE POLICY "Admin reads org profiles"
  ON public.user_profiles FOR SELECT TO authenticated
  USING (
    organization_id = public.get_user_org_id()
    AND public.get_user_role() = 'admin'
  );

-- 5. Ensure organizations has a SELECT policy for authenticated users
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'organizations' AND policyname = 'Org members can read own org'
  ) THEN
    EXECUTE 'CREATE POLICY "Org members can read own org" ON public.organizations FOR SELECT TO authenticated USING (id = public.get_user_org_id())';
  END IF;
END $$;

-- 6. Ensure user_profiles has INSERT/UPDATE policies for own profile
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'user_profiles' AND policyname = 'User updates own profile'
  ) THEN
    EXECUTE 'CREATE POLICY "User updates own profile" ON public.user_profiles FOR UPDATE TO authenticated USING (id = auth.uid()) WITH CHECK (id = auth.uid())';
  END IF;
END $$;

-- 7. Create lead tables if they don't exist (from docs/migration-lead-funnels.sql)

-- lead_campaigns
CREATE TABLE IF NOT EXISTS public.lead_campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  color text NOT NULL DEFAULT '#6366f1',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.lead_campaigns ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "lead_campaigns_all" ON public.lead_campaigns;
CREATE POLICY "lead_campaigns_all" ON public.lead_campaigns FOR ALL TO authenticated
  USING (organization_id = public.get_user_org_id())
  WITH CHECK (organization_id = public.get_user_org_id());

-- lead_funnels
CREATE TABLE IF NOT EXISTS public.lead_funnels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  campaign_id uuid REFERENCES public.lead_campaigns(id) ON DELETE SET NULL,
  name text NOT NULL,
  description text,
  color text NOT NULL DEFAULT '#10b981',
  webhook_token text NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(24), 'hex'),
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.lead_funnels ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "lead_funnels_all" ON public.lead_funnels;
CREATE POLICY "lead_funnels_all" ON public.lead_funnels FOR ALL TO authenticated
  USING (organization_id = public.get_user_org_id())
  WITH CHECK (organization_id = public.get_user_org_id());
DROP POLICY IF EXISTS "lead_funnels_service" ON public.lead_funnels;
CREATE POLICY "lead_funnels_service" ON public.lead_funnels FOR ALL TO service_role USING (true) WITH CHECK (true);

-- lead_funnel_stages
CREATE TABLE IF NOT EXISTS public.lead_funnel_stages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  funnel_id uuid NOT NULL REFERENCES public.lead_funnels(id) ON DELETE CASCADE,
  name text NOT NULL,
  color text NOT NULL DEFAULT '#3b82f6',
  sort_order integer NOT NULL DEFAULT 0,
  page_url text,
  thumbnail_url text,
  position_x double precision NOT NULL DEFAULT 0,
  position_y double precision NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.lead_funnel_stages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "lead_funnel_stages_all" ON public.lead_funnel_stages;
CREATE POLICY "lead_funnel_stages_all" ON public.lead_funnel_stages FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.lead_funnels f WHERE f.id = funnel_id AND f.organization_id = public.get_user_org_id()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.lead_funnels f WHERE f.id = funnel_id AND f.organization_id = public.get_user_org_id()));
DROP POLICY IF EXISTS "lead_funnel_stages_service" ON public.lead_funnel_stages;
CREATE POLICY "lead_funnel_stages_service" ON public.lead_funnel_stages FOR ALL TO service_role USING (true) WITH CHECK (true);

-- stage_transition_rules
CREATE TABLE IF NOT EXISTS public.stage_transition_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  funnel_id uuid NOT NULL REFERENCES public.lead_funnels(id) ON DELETE CASCADE,
  event_name text NOT NULL,
  from_stage_id uuid REFERENCES public.lead_funnel_stages(id) ON DELETE CASCADE,
  to_stage_id uuid NOT NULL REFERENCES public.lead_funnel_stages(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.stage_transition_rules ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "stage_transition_rules_all" ON public.stage_transition_rules;
CREATE POLICY "stage_transition_rules_all" ON public.stage_transition_rules FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.lead_funnels f WHERE f.id = funnel_id AND f.organization_id = public.get_user_org_id()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.lead_funnels f WHERE f.id = funnel_id AND f.organization_id = public.get_user_org_id()));
DROP POLICY IF EXISTS "stage_transition_rules_service" ON public.stage_transition_rules;
CREATE POLICY "stage_transition_rules_service" ON public.stage_transition_rules FOR ALL TO service_role USING (true) WITH CHECK (true);

-- leads
CREATE TABLE IF NOT EXISTS public.leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  phone text,
  email text,
  name text,
  utm_source text,
  utm_medium text,
  utm_campaign text,
  utm_content text,
  utm_term text,
  metadata jsonb DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT leads_org_phone_unique UNIQUE (organization_id, phone),
  CONSTRAINT leads_org_email_unique UNIQUE (organization_id, email),
  CONSTRAINT leads_has_contact CHECK (phone IS NOT NULL OR email IS NOT NULL)
);
ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "leads_all" ON public.leads;
CREATE POLICY "leads_all" ON public.leads FOR ALL TO authenticated
  USING (organization_id = public.get_user_org_id())
  WITH CHECK (organization_id = public.get_user_org_id());
DROP POLICY IF EXISTS "leads_service" ON public.leads;
CREATE POLICY "leads_service" ON public.leads FOR ALL TO service_role USING (true) WITH CHECK (true);

-- lead_events
CREATE TABLE IF NOT EXISTS public.lead_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  funnel_id uuid NOT NULL REFERENCES public.lead_funnels(id) ON DELETE CASCADE,
  event_name text NOT NULL,
  metadata jsonb DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.lead_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "lead_events_all" ON public.lead_events;
CREATE POLICY "lead_events_all" ON public.lead_events FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.leads l WHERE l.id = lead_id AND l.organization_id = public.get_user_org_id()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.leads l WHERE l.id = lead_id AND l.organization_id = public.get_user_org_id()));
DROP POLICY IF EXISTS "lead_events_service" ON public.lead_events;
CREATE POLICY "lead_events_service" ON public.lead_events FOR ALL TO service_role USING (true) WITH CHECK (true);

-- lead_stage_positions
CREATE TABLE IF NOT EXISTS public.lead_stage_positions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  funnel_id uuid NOT NULL REFERENCES public.lead_funnels(id) ON DELETE CASCADE,
  stage_id uuid NOT NULL REFERENCES public.lead_funnel_stages(id) ON DELETE CASCADE,
  entered_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT lead_stage_pos_unique UNIQUE (lead_id, funnel_id)
);
ALTER TABLE public.lead_stage_positions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "lead_stage_positions_all" ON public.lead_stage_positions;
CREATE POLICY "lead_stage_positions_all" ON public.lead_stage_positions FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.leads l WHERE l.id = lead_id AND l.organization_id = public.get_user_org_id()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.leads l WHERE l.id = lead_id AND l.organization_id = public.get_user_org_id()));
DROP POLICY IF EXISTS "lead_stage_positions_service" ON public.lead_stage_positions;
CREATE POLICY "lead_stage_positions_service" ON public.lead_stage_positions FOR ALL TO service_role USING (true) WITH CHECK (true);

-- funnel_source_nodes
CREATE TABLE IF NOT EXISTS public.funnel_source_nodes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  funnel_id uuid NOT NULL REFERENCES public.lead_funnels(id) ON DELETE CASCADE,
  source_type text NOT NULL DEFAULT 'other',
  label text NOT NULL,
  position_x double precision NOT NULL DEFAULT 0,
  position_y double precision NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.funnel_source_nodes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "funnel_source_nodes_all" ON public.funnel_source_nodes;
CREATE POLICY "funnel_source_nodes_all" ON public.funnel_source_nodes FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.lead_funnels f WHERE f.id = funnel_id AND f.organization_id = public.get_user_org_id()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.lead_funnels f WHERE f.id = funnel_id AND f.organization_id = public.get_user_org_id()));

-- funnel_edges
CREATE TABLE IF NOT EXISTS public.funnel_edges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  funnel_id uuid NOT NULL REFERENCES public.lead_funnels(id) ON DELETE CASCADE,
  source_node_id text NOT NULL,
  target_node_id text NOT NULL,
  source_type text NOT NULL DEFAULT 'stage',
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.funnel_edges ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "funnel_edges_all" ON public.funnel_edges;
CREATE POLICY "funnel_edges_all" ON public.funnel_edges FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.lead_funnels f WHERE f.id = funnel_id AND f.organization_id = public.get_user_org_id()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.lead_funnels f WHERE f.id = funnel_id AND f.organization_id = public.get_user_org_id()));

-- Performance indexes
CREATE INDEX IF NOT EXISTS idx_lead_funnels_org ON public.lead_funnels(organization_id);
CREATE INDEX IF NOT EXISTS idx_lead_funnels_campaign ON public.lead_funnels(campaign_id);
CREATE INDEX IF NOT EXISTS idx_lead_funnels_webhook ON public.lead_funnels(webhook_token);
CREATE INDEX IF NOT EXISTS idx_lead_funnel_stages_funnel ON public.lead_funnel_stages(funnel_id);
CREATE INDEX IF NOT EXISTS idx_leads_org ON public.leads(organization_id);
CREATE INDEX IF NOT EXISTS idx_lead_events_lead ON public.lead_events(lead_id);
CREATE INDEX IF NOT EXISTS idx_lead_events_funnel ON public.lead_events(funnel_id);
CREATE INDEX IF NOT EXISTS idx_lead_stage_positions_funnel ON public.lead_stage_positions(funnel_id);
CREATE INDEX IF NOT EXISTS idx_lead_stage_positions_stage ON public.lead_stage_positions(stage_id);
CREATE INDEX IF NOT EXISTS idx_stage_transition_rules_funnel ON public.stage_transition_rules(funnel_id);
