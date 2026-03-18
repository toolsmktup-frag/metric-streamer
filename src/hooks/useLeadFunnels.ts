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
      // Separate existing stages (have id) from new ones
      const existingStages = stages.filter(s => s.id);
      const newStages = stages.filter(s => !s.id);
      const keepIds = existingStages.map(s => s.id!);

      // Delete stages that were removed (not in keepIds)
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

      // Update existing stages
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
          })
          .eq('id', s.id);
      }

      // Insert new stages
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
          })));
        if (error) throw error;
      }

      // Fetch final result
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
