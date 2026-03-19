import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { Lead, LeadStagePosition, LeadEvent } from '@/types/leadFunnels';

const PAGE_SIZE = 1000;

async function fetchAllRows<T>(
  table: string,
  select: string,
  filter?: { column: string; value: string },
  orderBy?: { column: string; ascending?: boolean },
) {
  const rows: T[] = [];
  let from = 0;

  while (true) {
    let query = (supabase as any)
      .from(table)
      .select(select)
      .range(from, from + PAGE_SIZE - 1);

    if (filter) {
      query = query.eq(filter.column, filter.value);
    }
    if (orderBy) {
      query = query.order(orderBy.column, { ascending: orderBy.ascending ?? true });
    }

    const { data, error } = await query;
    if (error) throw error;

    const batch = (data || []) as T[];
    rows.push(...batch);

    if (batch.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }

  return rows;
}

export function useLeadsByFunnel(funnelId: string | null) {
  return useQuery({
    queryKey: ['leads-by-funnel', funnelId],
    queryFn: async () => {
      if (!funnelId) return [];
      return fetchAllRows<LeadStagePosition & { lead: Lead }>(
        'lead_stage_positions',
        '*, lead:leads(*)',
        { column: 'funnel_id', value: funnelId },
      );
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
      const data = await fetchAllRows<{ stage_id: string }>(
        'lead_stage_positions',
        'stage_id',
        { column: 'funnel_id', value: funnelId },
      );
      const counts: Record<string, number> = {};
      data.forEach((row) => {
        counts[row.stage_id] = (counts[row.stage_id] || 0) + 1;
      });
      return counts;
    },
    enabled: !!funnelId,
    refetchInterval: 30000,
  });
}
