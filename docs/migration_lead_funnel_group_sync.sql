-- Migration: WhatsApp group sync configuration and run logs
-- Execute on Supabase Dashboard or via migration tool
-- Date: 2026-04-21

CREATE TABLE IF NOT EXISTS public.lead_funnel_group_sync_configs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  funnel_id uuid NOT NULL REFERENCES public.lead_funnels(id) ON DELETE CASCADE,
  instance_id uuid NOT NULL REFERENCES public.wz_instances(id) ON DELETE CASCADE,
  group_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  in_group_stage_id uuid REFERENCES public.lead_funnel_stages(id) ON DELETE SET NULL,
  not_in_group_stage_id uuid REFERENCES public.lead_funnel_stages(id) ON DELETE SET NULL,
  invited_stage_id uuid REFERENCES public.lead_funnel_stages(id) ON DELETE SET NULL,
  left_group_stage_id uuid REFERENCES public.lead_funnel_stages(id) ON DELETE SET NULL,
  auto_move_on_join boolean NOT NULL DEFAULT true,
  auto_move_on_leave boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (funnel_id)
);

CREATE TABLE IF NOT EXISTS public.lead_funnel_group_sync_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  config_id uuid REFERENCES public.lead_funnel_group_sync_configs(id) ON DELETE SET NULL,
  funnel_id uuid NOT NULL REFERENCES public.lead_funnels(id) ON DELETE CASCADE,
  instance_id uuid REFERENCES public.wz_instances(id) ON DELETE SET NULL,
  mode text NOT NULL,
  group_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  total_positions integer NOT NULL DEFAULT 0,
  matched_count integer NOT NULL DEFAULT 0,
  missing_count integer NOT NULL DEFAULT 0,
  invalid_phone_count integer NOT NULL DEFAULT 0,
  moved_in_count integer NOT NULL DEFAULT 0,
  moved_out_count integer NOT NULL DEFAULT 0,
  invited_count integer NOT NULL DEFAULT 0,
  failed_invite_count integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'success',
  error_message text,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_group_sync_configs_funnel ON public.lead_funnel_group_sync_configs(funnel_id);
CREATE INDEX IF NOT EXISTS idx_group_sync_configs_instance ON public.lead_funnel_group_sync_configs(instance_id);
CREATE INDEX IF NOT EXISTS idx_group_sync_runs_funnel ON public.lead_funnel_group_sync_runs(funnel_id, created_at DESC);

ALTER TABLE public.lead_funnel_group_sync_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lead_funnel_group_sync_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "group_sync_configs_org_access" ON public.lead_funnel_group_sync_configs
FOR ALL TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.lead_funnels lf
    WHERE lf.id = lead_funnel_group_sync_configs.funnel_id
      AND lf.organization_id = public.get_user_org_id()
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.lead_funnels lf
    WHERE lf.id = lead_funnel_group_sync_configs.funnel_id
      AND lf.organization_id = public.get_user_org_id()
  )
);

CREATE POLICY "group_sync_runs_org_access" ON public.lead_funnel_group_sync_runs
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.lead_funnels lf
    WHERE lf.id = lead_funnel_group_sync_runs.funnel_id
      AND lf.organization_id = public.get_user_org_id()
  )
);
