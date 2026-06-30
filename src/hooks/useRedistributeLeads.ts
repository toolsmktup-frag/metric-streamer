import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { weightedSequence } from '@/lib/weightedDistribution';

interface RedistributeParams {
  funnelId: string;
  scope: 'unassigned' | 'assigned' | 'all' | 'from_seller';
  stageIds: string[]; // empty = all stages
  sellerIds: string[];
  fromSellerId?: string | null;
  mode?: 'equal' | 'weighted'; // default: 'equal' (round-robin igual)
  weights?: Record<string, number>; // sellerId -> peso, usado quando mode === 'weighted'
}

export function useRedistributeLeads() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({ funnelId, scope, stageIds, sellerIds, fromSellerId, mode = 'equal', weights }: RedistributeParams) => {
      if (!sellerIds.length) throw new Error('Selecione ao menos um vendedor');
      if (scope === 'from_seller' && !fromSellerId) throw new Error('Selecione o vendedor de origem');

      // 1. Fetch positions in batches to avoid URL length limits
      const allPositions: any[] = [];
      const PAGE_SIZE = 500;
      let from = 0;
      let hasMore = true;

      while (hasMore) {
        let query = (supabase as any)
          .from('lead_stage_positions')
          .select('id, lead_id, stage_id, entered_at')
          .eq('funnel_id', funnelId)
          .order('entered_at', { ascending: true })
          .range(from, from + PAGE_SIZE - 1);

        if (stageIds.length > 0) {
          query = query.in('stage_id', stageIds);
        }

        const { data: page, error: posErr } = await query;
        if (posErr) throw posErr;

        allPositions.push(...(page || []));
        hasMore = (page?.length || 0) === PAGE_SIZE;
        from += PAGE_SIZE;
      }

      const positions = allPositions;
      if (!positions.length) throw new Error('Nenhum lead encontrado com os filtros selecionados');

      // 2. Fetch leads to filter by scope
      const leadIds = [...new Set(positions.map((p: any) => p.lead_id))] as string[];
      
      // Fetch in batches of 500
      const leads: any[] = [];
      for (let i = 0; i < leadIds.length; i += 500) {
        const batch = leadIds.slice(i, i + 500);
        const { data, error } = await (supabase as any)
          .from('leads')
          .select('id, assigned_to')
          .in('id', batch);
        if (error) throw error;
        leads.push(...(data || []));
      }

      // 3. Filter by scope
      const leadsMap = new Map(leads.map((l: any) => [l.id, l]));
      let filteredLeadIds: string[];

      if (scope === 'unassigned') {
        filteredLeadIds = leadIds.filter(id => {
          const lead = leadsMap.get(id);
          return !lead?.assigned_to;
        });
      } else if (scope === 'assigned') {
        filteredLeadIds = leadIds.filter(id => {
          const lead = leadsMap.get(id);
          return !!lead?.assigned_to;
        });
      } else if (scope === 'from_seller') {
        filteredLeadIds = leadIds.filter(id => {
          const lead = leadsMap.get(id);
          return lead?.assigned_to === fromSellerId;
        });
      } else {
        filteredLeadIds = leadIds;
      }

      if (!filteredLeadIds.length) throw new Error('Nenhum lead encontrado com o escopo selecionado');

      // 4. Distribuição: igual (round-robin) ou ponderada (weighted round-robin).
      const updates: { leadId: string; sellerId: string }[] = [];
      if (mode === 'weighted') {
        const weightedSellers = sellerIds
          .map(id => ({ id, weight: weights?.[id] ?? 0 }))
          .filter(s => s.weight > 0);
        if (!weightedSellers.length) {
          throw new Error('Defina um peso maior que 0 para ao menos um vendedor');
        }
        const seq = weightedSequence(filteredLeadIds.length, weightedSellers);
        filteredLeadIds.forEach((leadId, idx) => {
          updates.push({ leadId, sellerId: seq[idx] });
        });
      } else {
        filteredLeadIds.forEach((leadId, idx) => {
          updates.push({
            leadId,
            sellerId: sellerIds[idx % sellerIds.length],
          });
        });
      }

      // 5. Batch update in chunks
      for (let i = 0; i < updates.length; i += 100) {
        const batch = updates.slice(i, i + 100);
        const promises = batch.map(u =>
          (supabase as any)
            .from('leads')
            .update({ assigned_to: u.sellerId, updated_at: new Date().toISOString() })
            .eq('id', u.leadId)
        );
        const results = await Promise.all(promises);
        const err = results.find(r => r.error);
        if (err?.error) throw err.error;
      }

      return updates.length;
    },
    onSuccess: (count, { funnelId }) => {
      toast.success(`${count} lead(s) redistribuído(s) com sucesso!`);
      qc.invalidateQueries({ queryKey: ['leads-by-funnel', funnelId] });
      qc.invalidateQueries({ queryKey: ['all-leads'] });
    },
    onError: (err: any) => {
      toast.error(err.message || 'Erro ao redistribuir leads');
    },
  });
}
