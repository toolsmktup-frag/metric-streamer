-- ============================================================
-- Migration: automation_rules + automation_rule_logs
-- Rodar no Supabase SQL Editor
-- ============================================================

-- 1. Tabela automation_rules
CREATE TABLE IF NOT EXISTS public.automation_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  is_active BOOLEAN DEFAULT true,
  conditions JSONB NOT NULL DEFAULT '[]',
  action TEXT NOT NULL,
  action_params JSONB DEFAULT '{}',
  scope_type TEXT DEFAULT 'campaign',
  scope_ids TEXT[] DEFAULT '{}',
  funnel_id UUID REFERENCES public.funnels(id) ON DELETE SET NULL,
  check_interval_minutes INT DEFAULT 15,
  last_checked_at TIMESTAMPTZ,
  last_triggered_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 2. Tabela automation_rule_logs
CREATE TABLE IF NOT EXISTS public.automation_rule_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_id UUID NOT NULL REFERENCES public.automation_rules(id) ON DELETE CASCADE,
  triggered_at TIMESTAMPTZ DEFAULT now(),
  conditions_snapshot JSONB,
  action_taken TEXT,
  target_id TEXT,
  meta_response JSONB,
  status TEXT DEFAULT 'success'
);

-- 3. Índices
CREATE INDEX IF NOT EXISTS idx_automation_rules_org ON public.automation_rules(organization_id);
CREATE INDEX IF NOT EXISTS idx_automation_rules_active ON public.automation_rules(is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_automation_rule_logs_rule ON public.automation_rule_logs(rule_id);
CREATE INDEX IF NOT EXISTS idx_automation_rule_logs_triggered ON public.automation_rule_logs(triggered_at DESC);

-- 4. RLS
ALTER TABLE public.automation_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.automation_rule_logs ENABLE ROW LEVEL SECURITY;

-- Policies para automation_rules
CREATE POLICY "Users can view own org rules"
  ON public.automation_rules FOR SELECT
  TO authenticated
  USING (
    organization_id IN (
      SELECT organization_id FROM public.user_profiles WHERE id = auth.uid()
    )
  );

CREATE POLICY "Users can insert own org rules"
  ON public.automation_rules FOR INSERT
  TO authenticated
  WITH CHECK (
    organization_id IN (
      SELECT organization_id FROM public.user_profiles WHERE id = auth.uid()
    )
  );

CREATE POLICY "Users can update own org rules"
  ON public.automation_rules FOR UPDATE
  TO authenticated
  USING (
    organization_id IN (
      SELECT organization_id FROM public.user_profiles WHERE id = auth.uid()
    )
  );

CREATE POLICY "Users can delete own org rules"
  ON public.automation_rules FOR DELETE
  TO authenticated
  USING (
    organization_id IN (
      SELECT organization_id FROM public.user_profiles WHERE id = auth.uid()
    )
  );

-- Policies para automation_rule_logs (somente leitura via org)
CREATE POLICY "Users can view own org rule logs"
  ON public.automation_rule_logs FOR SELECT
  TO authenticated
  USING (
    rule_id IN (
      SELECT id FROM public.automation_rules
      WHERE organization_id IN (
        SELECT organization_id FROM public.user_profiles WHERE id = auth.uid()
      )
    )
  );

-- Service role pode inserir logs (Edge Function)
CREATE POLICY "Service role can insert logs"
  ON public.automation_rule_logs FOR INSERT
  TO service_role
  WITH CHECK (true);

-- Trigger updated_at
CREATE OR REPLACE FUNCTION update_automation_rules_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_automation_rules_updated_at ON public.automation_rules;
CREATE TRIGGER trigger_automation_rules_updated_at
  BEFORE UPDATE ON public.automation_rules
  FOR EACH ROW
  EXECUTE FUNCTION update_automation_rules_updated_at();

-- ============================================================
-- Verificação
-- SELECT * FROM public.automation_rules LIMIT 1;
-- SELECT * FROM public.automation_rule_logs LIMIT 1;
-- ============================================================
