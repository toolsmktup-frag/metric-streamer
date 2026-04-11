

## Fix: Migration SQL com DROP POLICY antes de cada CREATE

O erro ocorre porque as policies ja foram criadas anteriormente. A solucao e adicionar `DROP POLICY IF EXISTS` antes de cada `CREATE POLICY`.

### SQL corrigido para rodar no Supabase SQL Editor

```sql
-- Tabelas (IF NOT EXISTS ja protege)
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

-- Indices
CREATE INDEX IF NOT EXISTS idx_automation_rules_org ON public.automation_rules(organization_id);
CREATE INDEX IF NOT EXISTS idx_automation_rules_active ON public.automation_rules(is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_automation_rule_logs_rule ON public.automation_rule_logs(rule_id);
CREATE INDEX IF NOT EXISTS idx_automation_rule_logs_triggered ON public.automation_rule_logs(triggered_at DESC);

-- RLS
ALTER TABLE public.automation_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.automation_rule_logs ENABLE ROW LEVEL SECURITY;

-- Drop policies existentes antes de recriar
DROP POLICY IF EXISTS "Users can view own org rules" ON public.automation_rules;
DROP POLICY IF EXISTS "Users can insert own org rules" ON public.automation_rules;
DROP POLICY IF EXISTS "Users can update own org rules" ON public.automation_rules;
DROP POLICY IF EXISTS "Users can delete own org rules" ON public.automation_rules;
DROP POLICY IF EXISTS "Users can view own org rule logs" ON public.automation_rule_logs;
DROP POLICY IF EXISTS "Service role can insert logs" ON public.automation_rule_logs;
DROP POLICY IF EXISTS "Service role full access rules" ON public.automation_rules;
DROP POLICY IF EXISTS "Service role full access rule logs" ON public.automation_rule_logs;

-- Policies automation_rules
CREATE POLICY "Users can view own org rules"
  ON public.automation_rules FOR SELECT TO authenticated
  USING (organization_id IN (SELECT organization_id FROM public.user_profiles WHERE id = auth.uid()));

CREATE POLICY "Users can insert own org rules"
  ON public.automation_rules FOR INSERT TO authenticated
  WITH CHECK (organization_id IN (SELECT organization_id FROM public.user_profiles WHERE id = auth.uid()));

CREATE POLICY "Users can update own org rules"
  ON public.automation_rules FOR UPDATE TO authenticated
  USING (organization_id IN (SELECT organization_id FROM public.user_profiles WHERE id = auth.uid()));

CREATE POLICY "Users can delete own org rules"
  ON public.automation_rules FOR DELETE TO authenticated
  USING (organization_id IN (SELECT organization_id FROM public.user_profiles WHERE id = auth.uid()));

-- Policies automation_rule_logs
CREATE POLICY "Users can view own org rule logs"
  ON public.automation_rule_logs FOR SELECT TO authenticated
  USING (rule_id IN (SELECT id FROM public.automation_rules WHERE organization_id IN (SELECT organization_id FROM public.user_profiles WHERE id = auth.uid())));

-- Service role
CREATE POLICY "Service role full access rules"
  ON public.automation_rules FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE POLICY "Service role full access rule logs"
  ON public.automation_rule_logs FOR ALL TO service_role
  USING (true) WITH CHECK (true);

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
```

Copie e cole esse SQL inteiro no SQL Editor do Supabase. O `DROP POLICY IF EXISTS` garante que nao vai dar erro mesmo que as policies ja existam.

