import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface RuleCondition {
  metric: 'cpa' | 'roi' | 'roas' | 'spend' | 'revenue';
  operator: '>' | '<' | '>=' | '<=' | '=';
  value: number;
}

export interface AutomationRule {
  id: string;
  organization_id: string;
  name: string;
  is_active: boolean;
  conditions: RuleCondition[];
  action: 'pause_campaign' | 'reduce_budget' | 'alert';
  action_params: Record<string, any>;
  scope_type: 'campaign' | 'adset' | 'ad';
  scope_ids: string[];
  funnel_id: string | null;
  check_interval_minutes: number;
  last_checked_at: string | null;
  last_triggered_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface AutomationRuleLog {
  id: string;
  rule_id: string;
  triggered_at: string;
  conditions_snapshot: any;
  action_taken: string;
  target_id: string | null;
  meta_response: any;
  status: 'success' | 'error';
}

async function getOrgId(): Promise<string> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Não autenticado');
  const { data } = await (supabase as any)
    .from('user_profiles')
    .select('organization_id')
    .eq('id', user.id)
    .single();
  if (!data?.organization_id) throw new Error('Sem organização');
  return data.organization_id;
}

export function useAutoRules() {
  return useQuery({
    queryKey: ['automation-rules'],
    queryFn: async () => {
      const orgId = await getOrgId();
      const { data, error } = await (supabase as any)
        .from('automation_rules')
        .select('*')
        .eq('organization_id', orgId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data || []) as AutomationRule[];
    },
  });
}

export function useAutoRuleLogs(ruleId?: string) {
  return useQuery({
    queryKey: ['automation-rule-logs', ruleId],
    enabled: !!ruleId,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('automation_rule_logs')
        .select('*')
        .eq('rule_id', ruleId)
        .order('triggered_at', { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data || []) as AutomationRuleLog[];
    },
  });
}

export function useRecentLogs() {
  return useQuery({
    queryKey: ['automation-rule-logs-recent'],
    queryFn: async () => {
      const orgId = await getOrgId();
      const { data, error } = await (supabase as any)
        .from('automation_rule_logs')
        .select('*, automation_rules!inner(name, organization_id)')
        .eq('automation_rules.organization_id', orgId)
        .order('triggered_at', { ascending: false })
        .limit(30);
      if (error) throw error;
      return (data || []) as (AutomationRuleLog & { automation_rules: { name: string } })[];
    },
  });
}

export function useCreateRule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (rule: Omit<AutomationRule, 'id' | 'organization_id' | 'created_at' | 'updated_at' | 'last_checked_at' | 'last_triggered_at'>) => {
      const orgId = await getOrgId();
      const { data, error } = await (supabase as any)
        .from('automation_rules')
        .insert({ ...rule, organization_id: orgId })
        .select()
        .single();
      if (error) throw error;
      return data as AutomationRule;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['automation-rules'] }),
  });
}

export function useUpdateRule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...updates }: Partial<AutomationRule> & { id: string }) => {
      const { data, error } = await (supabase as any)
        .from('automation_rules')
        .update({ ...updates, updated_at: new Date().toISOString() })
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      return data as AutomationRule;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['automation-rules'] }),
  });
}

export function useDeleteRule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any)
        .from('automation_rules')
        .delete()
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['automation-rules'] }),
  });
}

export function useToggleRule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      const { error } = await (supabase as any)
        .from('automation_rules')
        .update({ is_active, updated_at: new Date().toISOString() })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['automation-rules'] }),
  });
}
