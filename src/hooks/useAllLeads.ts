import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { Lead, LeadStagePosition, LeadFunnel, LeadFunnelStage } from '@/types/leadFunnels';

const PAGE_SIZE = 1000;

async function fetchAllRows<T>(table: string, select: string, orderBy?: { column: string; ascending?: boolean }) {
  const rows: T[] = [];
  let from = 0;

  while (true) {
    let query = (supabase as any)
      .from(table)
      .select(select)
      .range(from, from + PAGE_SIZE - 1);

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

export interface LeadWithPosition extends Lead {
  positions: (LeadStagePosition & { funnel_name?: string; stage_name?: string; funnel_color?: string; stage_color?: string })[];
}

export function useAllLeads() {
  return useQuery({
    queryKey: ['all-leads'],
    queryFn: async () => {
      const [leads, positions, funnels] = await Promise.all([
        fetchAllRows<Lead>('leads', '*', { column: 'created_at', ascending: false }),
        fetchAllRows<LeadStagePosition>('lead_stage_positions', '*'),
        fetchAllRows<LeadFunnel>('lead_funnels', '*, lead_funnel_stages!lead_funnel_stages_funnel_id_fkey(*)'),
      ]);

      const funnelMap = new Map(funnels.map(f => [f.id, f]));
      const stageMap = new Map<string, LeadFunnelStage>();
      funnels.forEach(f => (f.lead_funnel_stages || []).forEach((s: LeadFunnelStage) => stageMap.set(s.id, s)));

      const positionsByLead = new Map<string, LeadWithPosition['positions']>();
      positions.forEach(p => {
        const funnel = funnelMap.get(p.funnel_id);
        const stage = stageMap.get(p.stage_id);
        const entry = {
          ...p,
          funnel_name: funnel?.name,
          stage_name: stage?.name,
          funnel_color: funnel?.color,
          stage_color: stage?.color,
        };
        const arr = positionsByLead.get(p.lead_id) || [];
        arr.push(entry);
        positionsByLead.set(p.lead_id, arr);
      });

      return leads.map(lead => ({
        ...lead,
        positions: positionsByLead.get(lead.id) || [],
      })) as LeadWithPosition[];
    },
    refetchInterval: 30000,
  });
}

export function useFunnelList() {
  return useQuery({
    queryKey: ['funnel-list'],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('lead_funnels')
        .select('id, name, color')
        .order('name');
      if (error) throw error;
      return (data || []) as { id: string; name: string; color: string | null }[];
    },
    staleTime: 60000,
  });
}

// Base data query - fetched ONCE and cached, shared across all funnel/date filters
function useLeadStatsBase() {
  return useQuery({
    queryKey: ['lead-stats-base'],
    queryFn: async () => {
      const [leads, positions, funnels] = await Promise.all([
        fetchAllRows<Pick<Lead, 'id' | 'created_at' | 'utm_source' | 'utm_medium'>>('leads', 'id, created_at, utm_source, utm_medium'),
        fetchAllRows<Pick<LeadStagePosition, 'lead_id' | 'funnel_id' | 'stage_id' | 'entered_at'>>('lead_stage_positions', 'lead_id, funnel_id, stage_id, entered_at'),
        fetchAllRows<LeadFunnel>('lead_funnels', 'id, name, color, lead_funnel_stages!lead_funnel_stages_funnel_id_fkey(id, name, sort_order)'),
      ]);
      return { leads, positions, funnels };
    },
    refetchInterval: 30000,
    staleTime: 15000,
  });
}

export function useLeadStats(startDate?: Date, endDate?: Date, funnelId?: string | null) {
  const { data: baseData, isLoading } = useLeadStatsBase();

  const stats = useMemo(() => {
    if (!baseData) return null;

    const { leads, positions, funnels } = baseData;

    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
    const weekAgo = new Date(now.getTime() - 7 * 86400000).toISOString();

    // Build lead entry dates from positions
    const firstEntryByLead = new Map<string, string>();
    positions.forEach((position) => {
      const existing = firstEntryByLead.get(position.lead_id);
      if (!existing || position.entered_at < existing) {
        firstEntryByLead.set(position.lead_id, position.entered_at);
      }
    });

    const leadsWithEntryDate = leads.map((lead) => ({
      ...lead,
      entryDate: firstEntryByLead.get(lead.id) || lead.created_at,
    }));

    // Filter by date range
    const rangeStart = startDate ? startDate.toISOString() : null;
    const rangeEnd = endDate ? endDate.toISOString() : null;

    let filteredLeads = (rangeStart && rangeEnd)
      ? leadsWithEntryDate.filter(l => l.entryDate >= rangeStart && l.entryDate <= rangeEnd)
      : leadsWithEntryDate;

    // Filter by funnel if specified
    let leadIdsInFunnel: Set<string> | null = null;
    if (funnelId) {
      leadIdsInFunnel = new Set(
        positions.filter(p => p.funnel_id === funnelId).map(p => p.lead_id)
      );
      filteredLeads = filteredLeads.filter(l => leadIdsInFunnel!.has(l.id));
    }

    const total = filteredLeads.length;

    // Novos hoje/semana (respect funnel filter but not date range)
    const baseForRecent = funnelId && leadIdsInFunnel
      ? leadsWithEntryDate.filter(l => leadIdsInFunnel!.has(l.id))
      : leadsWithEntryDate;
    const newToday = baseForRecent.filter((lead) => lead.entryDate >= today).length;
    const newWeek = baseForRecent.filter((lead) => lead.entryDate >= weekAgo).length;

    const dailyMap = new Map<string, number>();
    filteredLeads.forEach((lead) => {
      const key = lead.entryDate.slice(0, 10);
      dailyMap.set(key, (dailyMap.get(key) || 0) + 1);
    });
    const dailyLeads = Array.from(dailyMap.entries())
      .map(([date, count]) => ({ date, count }))
      .sort((a, b) => a.date.localeCompare(b.date));

    const filteredLeadIds = new Set(filteredLeads.map(l => l.id));

    const sourceMap = new Map<string, number>();
    filteredLeads.forEach((lead) => {
      const source = lead.utm_source || 'Direto';
      sourceMap.set(source, (sourceMap.get(source) || 0) + 1);
    });
    const bySource = Array.from(sourceMap.entries())
      .map(([source, count]) => ({ source, count }))
      .sort((a, b) => b.count - a.count);

    const sourceMediumMap = new Map<string, { source: string; medium: string; count: number }>();
    filteredLeads.forEach((lead) => {
      const source = lead.utm_source || 'Direto';
      const medium = lead.utm_medium || '(none)';
      const key = `${source}||${medium}`;
      const existing = sourceMediumMap.get(key);
      if (existing) existing.count += 1;
      else sourceMediumMap.set(key, { source, medium, count: 1 });
    });
    const bySourceMedium = Array.from(sourceMediumMap.values())
      .sort((a, b) => b.count - a.count);

    const funnelCountMap = new Map<string, number>();
    positions.forEach((position) => {
      if (filteredLeadIds.has(position.lead_id)) {
        funnelCountMap.set(position.funnel_id, (funnelCountMap.get(position.funnel_id) || 0) + 1);
      }
    });
    const byFunnel = funnels.map(funnel => ({
      id: funnel.id,
      name: funnel.name,
      color: funnel.color,
      count: funnelCountMap.get(funnel.id) || 0,
    })).sort((a, b) => b.count - a.count);

    return { total, newToday, newWeek, dailyLeads, bySource, bySourceMedium, byFunnel };
  }, [baseData, startDate, endDate, funnelId]);

  return { data: stats, isLoading };
}
