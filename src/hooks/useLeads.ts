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

export function useLeadsByFunnel(
  funnelId: string | null,
  options?: {
    refetchInterval?: number | false;
    /** Funis adicionais cujos lead_stage_positions devem ser agregados (visão geral). */
    aggregateFromFunnelIds?: string[];
    /** Mapa stage_name (lowercase) → stage_id do funil destino. Fallback usado quando não há mapeamento explícito. */
    stageNameToIdMap?: Record<string, string>;
    /** Mapa source_stage_id → target_stage_id (mapeamento explícito). Tem precedência sobre stageNameToIdMap. */
    sourceStageIdToTargetStageIdMap?: Record<string, string>;
  }
) {
  const extraIds = (options?.aggregateFromFunnelIds || []).filter(Boolean);
  const stageMap = options?.stageNameToIdMap || {};
  const explicitMap = options?.sourceStageIdToTargetStageIdMap || {};
  const stageMapKey = Object.keys(stageMap).sort().map(k => `${k}:${stageMap[k]}`).join('|');
  const explicitMapKey = Object.keys(explicitMap).sort().map(k => `${k}:${explicitMap[k]}`).join('|');
  return useQuery({
    queryKey: ['leads-by-funnel', funnelId, extraIds.slice().sort().join(','), stageMapKey, explicitMapKey],
    queryFn: async () => {
      if (!funnelId) return [];
      const own = await fetchAllRows<LeadStagePosition & { lead: Lead }>(
        'lead_stage_positions',
        '*, lead:leads(*)',
        { column: 'funnel_id', value: funnelId },
      );
      if (extraIds.length === 0) return own;

      // Agrega posições dos funis selecionados, remapeando stage_id pelo nome da etapa do funil destino
      const aggregated: (LeadStagePosition & { lead: Lead })[] = [];
      for (const srcId of extraIds) {
        if (srcId === funnelId) continue;
        const [srcStagesRes, srcPositions] = await Promise.all([
          (supabase as any).from('lead_funnel_stages').select('id, name').eq('funnel_id', srcId),
          fetchAllRows<LeadStagePosition & { lead: Lead }>(
            'lead_stage_positions',
            '*, lead:leads(*)',
            { column: 'funnel_id', value: srcId },
          ),
        ]);
        const srcStageIdToName: Record<string, string> = {};
        for (const s of (srcStagesRes.data || []) as { id: string; name: string }[]) {
          srcStageIdToName[s.id] = (s.name || '').trim().toLowerCase();
        }
        for (const p of srcPositions) {
          // Precedência: mapeamento explícito por source_stage_id; fallback por nome.
          const explicit = explicitMap[p.stage_id];
          const nm = srcStageIdToName[p.stage_id];
          const remapped = explicit || (nm ? stageMap[nm] : undefined);
          if (!remapped) continue;
          aggregated.push({ ...p, stage_id: remapped, funnel_id: funnelId });
        }
      }
      // Dedupe por lead_id (mantém a posição mais recente)
      const byLead = new Map<string, LeadStagePosition & { lead: Lead }>();
      for (const p of [...own, ...aggregated]) {
        const cur = byLead.get(p.lead_id);
        if (!cur || new Date(p.entered_at) > new Date(cur.entered_at)) byLead.set(p.lead_id, p);
      }
      return Array.from(byLead.values());
    },
    enabled: !!funnelId,
    refetchInterval: options?.refetchInterval ?? false,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
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

export function useFunnelStageHistoryCounts(funnelId: string | null) {
  return useQuery({
    queryKey: ['funnel-stage-history-counts', funnelId],
    queryFn: async () => {
      if (!funnelId) return {};

      const [events, positions] = await Promise.all([
        fetchAllRows<Pick<LeadEvent, 'lead_id' | 'metadata'>>(
          'lead_events',
          'lead_id, metadata',
          { column: 'funnel_id', value: funnelId },
        ),
        fetchAllRows<Pick<LeadStagePosition, 'lead_id' | 'stage_id'>>(
          'lead_stage_positions',
          'lead_id, stage_id',
          { column: 'funnel_id', value: funnelId },
        ),
      ]);

      const leadsByStage = new Map<string, Set<string>>();
      const addLeadToStage = (stageId: unknown, leadId: string) => {
        if (typeof stageId !== 'string' || !stageId) return;
        const leadSet = leadsByStage.get(stageId) || new Set<string>();
        leadSet.add(leadId);
        leadsByStage.set(stageId, leadSet);
      };

      events.forEach((event) => {
        const metadata = event.metadata || {};
        addLeadToStage(metadata.from_stage_id, event.lead_id);
        addLeadToStage(metadata.to_stage_id, event.lead_id);
      });

      positions.forEach((position) => {
        addLeadToStage(position.stage_id, position.lead_id);
      });

      const counts: Record<string, number> = {};
      leadsByStage.forEach((leadSet, stageId) => {
        counts[stageId] = leadSet.size;
      });

      return counts;
    },
    enabled: !!funnelId,
    refetchInterval: 30000,
  });
}
