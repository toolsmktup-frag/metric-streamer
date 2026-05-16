import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface LeadFunnelStageMapping {
  id: string;
  target_funnel_id: string;
  source_stage_id: string;
  target_stage_id: string;
  created_at: string;
}

export function useLeadFunnelStageMappings(targetFunnelId: string | null) {
  return useQuery({
    queryKey: ['lead-funnel-stage-mappings', targetFunnelId],
    queryFn: async () => {
      if (!targetFunnelId) return [] as LeadFunnelStageMapping[];
      const { data, error } = await (supabase as any)
        .from('lead_funnel_stage_mappings')
        .select('*')
        .eq('target_funnel_id', targetFunnelId);
      if (error) throw error;
      return (data || []) as LeadFunnelStageMapping[];
    },
    enabled: !!targetFunnelId,
    staleTime: 60_000,
  });
}

export function useUpsertLeadFunnelStageMappings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      targetFunnelId,
      mappings,
    }: {
      targetFunnelId: string;
      mappings: { source_stage_id: string; target_stage_id: string }[];
    }) => {
      const { error: delError } = await (supabase as any)
        .from('lead_funnel_stage_mappings')
        .delete()
        .eq('target_funnel_id', targetFunnelId);
      if (delError) throw delError;

      if (mappings.length > 0) {
        const rows = mappings.map(m => ({
          target_funnel_id: targetFunnelId,
          source_stage_id: m.source_stage_id,
          target_stage_id: m.target_stage_id,
        }));
        const { error } = await (supabase as any)
          .from('lead_funnel_stage_mappings')
          .insert(rows);
        if (error) throw error;
      }
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['lead-funnel-stage-mappings', vars.targetFunnelId] });
      qc.invalidateQueries({ queryKey: ['leads-by-funnel'] });
    },
  });
}
