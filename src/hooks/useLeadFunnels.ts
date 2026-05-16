import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { LeadFunnel, LeadFunnelStage, StageTransitionRule, FunnelSourceNode, FunnelEdge } from '@/types/leadFunnels';

async function fetchOrgId(): Promise<string> {
  const { data, error } = await (supabase as any).rpc('get_user_org_id');
  if (error) throw new Error(`Falha ao obter organização: ${error.message}`);
  if (!data) throw new Error('Seu perfil não está vinculado a uma organização.');
  return data as string;
}

export function useLeadFunnels(campaignId?: string | null) {
  return useQuery({
    queryKey: ['lead-funnels', campaignId],
    queryFn: async () => {
      try {
        let query = (supabase as any)
          .from('lead_funnels')
          .select('*, lead_funnel_stages(*), stage_transition_rules(*), lead_funnel_campaigns(lead_campaign_id)')
          .order('sort_order', { ascending: true });
        if (campaignId) query = query.eq('campaign_id', campaignId);
        const { data, error } = await query;
        if (error) {
          console.warn('[useLeadFunnels] query error:', error.message);
          return [];
        }
        return (data || []) as LeadFunnel[];
      } catch (err) {
        console.warn('[useLeadFunnels] unexpected error:', err);
        return [];
      }
    },
  });
}

export function useLeadFunnel(id: string | null) {
  return useQuery({
    queryKey: ['lead-funnel', id],
    queryFn: async () => {
      if (!id) return null;
      try {
        const { data, error } = await (supabase as any)
          .from('lead_funnels')
          .select('*, lead_funnel_stages(*), stage_transition_rules(*), lead_funnel_campaigns(lead_campaign_id)')
          .eq('id', id)
          .single();
        if (error) {
          console.warn('[useLeadFunnel] query error:', error.message);
          return null;
        }
        return data as LeadFunnel;
      } catch (err) {
        console.warn('[useLeadFunnel] unexpected error:', err);
        return null;
      }
    },
    enabled: !!id,
  });
}

export function useCreateLeadFunnel() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (funnel: Partial<LeadFunnel>) => {
      const orgId = await fetchOrgId();
      const { data, error } = await (supabase as any)
        .from('lead_funnels')
        .insert({ ...funnel, organization_id: orgId })
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
      const existingStages = stages.filter(s => s.id);
      const newStages = stages.filter(s => !s.id);
      const keepIds = existingStages.map(s => s.id!);

      if (keepIds.length > 0) {
        await (supabase as any)
          .from('lead_funnel_stages')
          .delete()
          .eq('funnel_id', funnelId)
          .not('id', 'in', `(${keepIds.join(',')})`);
      } else {
        await (supabase as any)
          .from('lead_funnel_stages')
          .delete()
          .eq('funnel_id', funnelId);
      }

      for (let i = 0; i < existingStages.length; i++) {
        const s = existingStages[i];
        await (supabase as any)
          .from('lead_funnel_stages')
          .update({
            name: s.name,
            color: s.color,
            sort_order: stages.indexOf(s),
            page_url: s.page_url || null,
            page_type: s.page_type || null,
            hide_values: !!s.hide_values,
            conversion_base_stage_id: s.conversion_base_stage_id || null,
            visual_parent_stage_id: s.visual_parent_stage_id || null,
          })
          .eq('id', s.id);
      }

      if (newStages.length > 0) {
        const { error } = await (supabase as any)
          .from('lead_funnel_stages')
          .insert(newStages.map((s, i) => ({
            funnel_id: funnelId,
            name: s.name,
            color: s.color,
            sort_order: existingStages.length + i,
            page_url: s.page_url || null,
            page_type: s.page_type || null,
            hide_values: !!s.hide_values,
            conversion_base_stage_id: s.conversion_base_stage_id || null,
            visual_parent_stage_id: s.visual_parent_stage_id || null,
          })));
        if (error) throw error;
      }

      const { data, error } = await (supabase as any)
        .from('lead_funnel_stages')
        .select()
        .eq('funnel_id', funnelId)
        .order('sort_order');
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
      const { error: deleteError } = await (supabase as any).from('stage_transition_rules').delete().eq('funnel_id', funnelId);
      if (deleteError) throw deleteError;
      if (rules.length === 0) return [] as StageTransitionRule[];
      const { data, error } = await (supabase as any)
        .from('stage_transition_rules')
        .insert(rules.map(r => ({
          event_name: r.event_name,
          from_stage_id: r.from_stage_id || null,
          to_stage_id: r.to_stage_id,
          value_classification: r.value_classification || null,
          funnel_id: funnelId,
        })))
        .select();
      if (error) throw error;
      return data as StageTransitionRule[];
    },
    onSuccess: (savedRules, { funnelId }) => {
      // Immediately update the cached funnel with saved rules
      qc.setQueryData(['lead-funnel', funnelId], (old: any) => {
        if (!old) return old;
        return { ...old, stage_transition_rules: savedRules };
      });
      qc.invalidateQueries({ queryKey: ['lead-funnel', funnelId] });
      qc.invalidateQueries({ queryKey: ['lead-funnels'] });
    },
  });
}

// Source Nodes
export function useFunnelSourceNodes(funnelId: string | null) {
  return useQuery({
    queryKey: ['funnel-source-nodes', funnelId],
    queryFn: async () => {
      if (!funnelId) return [];
      const { data, error } = await (supabase as any)
        .from('funnel_source_nodes')
        .select('*')
        .eq('funnel_id', funnelId);
      if (error) throw error;
      return (data || []) as FunnelSourceNode[];
    },
    enabled: !!funnelId,
  });
}

export function useSaveFunnelSourceNodes() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ funnelId, nodes }: { funnelId: string; nodes: Partial<FunnelSourceNode>[] }) => {
      await (supabase as any).from('funnel_source_nodes').delete().eq('funnel_id', funnelId);
      if (nodes.length === 0) return [];
      const { data, error } = await (supabase as any)
        .from('funnel_source_nodes')
        .insert(nodes.map(n => ({ ...n, funnel_id: funnelId })))
        .select();
      if (error) throw error;
      return data as FunnelSourceNode[];
    },
    onSuccess: (_, { funnelId }) => {
      qc.invalidateQueries({ queryKey: ['funnel-source-nodes', funnelId] });
    },
  });
}

// Funnel Edges
export function useFunnelEdges(funnelId: string | null) {
  return useQuery({
    queryKey: ['funnel-edges', funnelId],
    queryFn: async () => {
      if (!funnelId) return [];
      const { data, error } = await (supabase as any)
        .from('funnel_edges')
        .select('*')
        .eq('funnel_id', funnelId);
      if (error) throw error;
      return (data || []) as FunnelEdge[];
    },
    enabled: !!funnelId,
  });
}

export function useSaveFunnelEdges() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ funnelId, edges }: { funnelId: string; edges: Partial<FunnelEdge>[] }) => {
      await (supabase as any).from('funnel_edges').delete().eq('funnel_id', funnelId);
      if (edges.length === 0) return [];
      const { data, error } = await (supabase as any)
        .from('funnel_edges')
        .insert(edges.map(e => ({ ...e, funnel_id: funnelId })))
        .select();
      if (error) throw error;
      return data as FunnelEdge[];
    },
    onSuccess: (_, { funnelId }) => {
      qc.invalidateQueries({ queryKey: ['funnel-edges', funnelId] });
    },
  });
}
