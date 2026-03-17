import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { Lead, LeadStagePosition, LeadEvent } from '@/types/leadFunnels';

export function useLeadsByFunnel(funnelId: string | null) {
  return useQuery({
    queryKey: ['leads-by-funnel', funnelId],
    queryFn: async () => {
      if (!funnelId) return [];
      const { data, error } = await (supabase as any)
        .from('lead_stage_positions')
        .select('*, lead:leads(*)')
        .eq('funnel_id', funnelId);
      if (error) throw error;
      return (data || []) as (LeadStagePosition & { lead: Lead })[];
    },
    enabled: !!funnelId,
  });
}

export function useLeadEvents(leadId: string | null) {
  return useQuery({
    queryKey: ['lead-events', leadId],
    queryFn: async () => {
      if (!leadId) return [];
      const { data, error } = await (supabase as any)
        .from('lead_events')
        .select('*')
        .eq('lead_id', leadId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data || []) as LeadEvent[];
    },
    enabled: !!leadId,
  });
}

export function useFunnelLeadCounts(funnelId: string | null) {
  return useQuery({
    queryKey: ['funnel-lead-counts', funnelId],
    queryFn: async () => {
      if (!funnelId) return {};
      const { data, error } = await (supabase as any)
        .from('lead_stage_positions')
        .select('stage_id')
        .eq('funnel_id', funnelId);
      if (error) throw error;
      const counts: Record<string, number> = {};
      (data || []).forEach((row: { stage_id: string }) => {
        counts[row.stage_id] = (counts[row.stage_id] || 0) + 1;
      });
      return counts;
    },
    enabled: !!funnelId,
  });
}
