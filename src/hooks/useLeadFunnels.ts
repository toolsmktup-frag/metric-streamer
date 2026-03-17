import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { LeadFunnel, LeadFunnelStage, StageTransitionRule } from '@/types/leadFunnels';

export function useLeadFunnels(campaignId?: string | null) {
  return useQuery({
    queryKey: ['lead-funnels', campaignId],
    queryFn: async () => {
      let query = (supabase as any)
        .from('lead_funnels')
        .select('*, lead_funnel_stages(*), stage_transition_rules(*)')
        .order('sort_order', { ascending: true });

      if (campaignId) query = query.eq('campaign_id', campaignId);

      const { data, error } = await query;
      if (error) throw error;
      return (data || []) as LeadFunnel[];
    },
  });
}

export function useLeadFunnel(id: string | null) {
  return useQuery({
    queryKey: ['lead-funnel', id],
    queryFn: async () => {
      if (!id) return null;
      const { data, error } = await (supabase as any)
        .from('lead_funnels')
        .select('*, lead_funnel_stages(*), stage_transition_rules(*)')
        .eq('id', id)
        .single();
      if (error) throw error;
      return data as LeadFunnel;
    },
    enabled: !!id,
  });
}

export function useCreateLeadFunnel() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (funnel: Partial<LeadFunnel>) => {
      const { data: profile } = await supabase.from('user_profiles').select('organization_id').single();
      const { data, error } = await (supabase as any)
        .from('lead_funnels')
        .insert({ ...funnel, organization_id: profile?.organization_id })
        .select()
        .single();
      if (error) throw error;
      return data as LeadFunnel;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['lead-funnels'] }),
  });
}

export function useUpdateLeadFunnel() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...updates }: Partial<LeadFunnel> & { id: string }) => {
      const { data, error } = await (supabase as any)
        .from('lead_funnels')
        .update({ ...updates, updated_at: new Date().toISOString() })
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      return data as LeadFunnel;
    },
    onSuccess: (_, { id }) => {
      qc.invalidateQueries({ queryKey: ['lead-funnels'] });
      qc.invalidateQueries({ queryKey: ['lead-funnel', id] });
    },
  });
}

export function useDeleteLeadFunnel() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any)
        .from('lead_funnels')
        .delete()
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['lead-funnels'] }),
  });
}

// Stages
export function useUpsertStages() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ funnelId, stages }: { funnelId: string; stages: Partial<LeadFunnelStage>[] }) => {
      // Delete old stages and re-insert
      await (supabase as any).from('lead_funnel_stages').delete().eq('funnel_id', funnelId);
      if (stages.length === 0) return [];
      const { data, error } = await (supabase as any)
        .from('lead_funnel_stages')
        .insert(stages.map((s, i) => ({ ...s, funnel_id: funnelId, sort_order: i })))
        .select();
      if (error) throw error;
      return data as LeadFunnelStage[];
    },
    onSuccess: (_, { funnelId }) => {
      qc.invalidateQueries({ queryKey: ['lead-funnel', funnelId] });
      qc.invalidateQueries({ queryKey: ['lead-funnels'] });
    },
  });
}

// Transition Rules
export function useUpsertTransitionRules() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ funnelId, rules }: { funnelId: string; rules: Partial<StageTransitionRule>[] }) => {
      await (supabase as any).from('stage_transition_rules').delete().eq('funnel_id', funnelId);
      if (rules.length === 0) return [];
      const { data, error } = await (supabase as any)
        .from('stage_transition_rules')
        .insert(rules.map(r => ({ ...r, funnel_id: funnelId })))
        .select();
      if (error) throw error;
      return data as StageTransitionRule[];
    },
    onSuccess: (_, { funnelId }) => {
      qc.invalidateQueries({ queryKey: ['lead-funnel', funnelId] });
    },
  });
}
