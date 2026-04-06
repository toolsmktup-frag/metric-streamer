import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { LeadFunnelStage } from '@/types/leadFunnels';

export function useLeadFunnelStages(funnelIds: string[]) {
  return useQuery({
    queryKey: ['lead-funnel-stages', funnelIds],
    queryFn: async () => {
      if (funnelIds.length === 0) return {} as Record<string, LeadFunnelStage[]>;
      const { data, error } = await (supabase as any)
        .from('lead_funnel_stages')
        .select('*')
        .in('funnel_id', funnelIds)
        .order('sort_order', { ascending: true });
      if (error) throw error;
      const grouped: Record<string, LeadFunnelStage[]> = {};
      for (const stage of (data || []) as LeadFunnelStage[]) {
        if (!grouped[stage.funnel_id]) grouped[stage.funnel_id] = [];
        grouped[stage.funnel_id].push(stage);
      }
      return grouped;
    },
    enabled: funnelIds.length > 0,
    staleTime: 60_000,
  });
}
