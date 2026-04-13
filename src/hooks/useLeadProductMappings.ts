import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface LeadProductMapping {
  id: string;
  lead_funnel_id: string;
  raw_product_name: string;
  lead_funnel_product_id: string;
  created_at: string;
}

export function useLeadProductMappings(funnelId: string | null) {
  return useQuery({
    queryKey: ['lead-product-mappings', funnelId],
    queryFn: async () => {
      if (!funnelId) return [];
      const { data, error } = await (supabase as any)
        .from('lead_product_mappings')
        .select('*')
        .eq('lead_funnel_id', funnelId);
      if (error) throw error;
      return (data || []) as LeadProductMapping[];
    },
    enabled: !!funnelId,
  });
}

/** Fetch distinct product_name values from lead_events (purchase events) for a given funnel */
export function useDistinctLeadProducts(funnelId: string | null) {
  return useQuery({
    queryKey: ['distinct-lead-products', funnelId],
    queryFn: async () => {
      if (!funnelId) return [];

      // 1. Get all lead_ids in this funnel
      const { data: positions, error: posErr } = await (supabase as any)
        .from('lead_stage_positions')
        .select('lead_id')
        .eq('funnel_id', funnelId);
      if (posErr) throw posErr;

      const leadIds = (positions || []).map((p: any) => p.lead_id);
      if (leadIds.length === 0) return [];

      // 2. Fetch all purchase events for these leads
      const purchaseEventNames = ['purchase', 'Purchase', 'pago', 'authorized', 'autorizado'];
      const names = new Set<string>();
      const BATCH = 500;

      for (let i = 0; i < leadIds.length; i += BATCH) {
        const batch = leadIds.slice(i, i + BATCH);
        const { data: events, error: evtErr } = await (supabase as any)
          .from('lead_events')
          .select('metadata')
          .in('lead_id', batch)
          .in('event_name', purchaseEventNames);
        if (evtErr) {
          console.error('[useDistinctLeadProducts] error:', evtErr.message);
          continue;
        }
        for (const evt of events || []) {
          const productName = evt.metadata?.product_name;
          if (productName && typeof productName === 'string' && productName.trim()) {
            names.add(productName.trim());
          }
        }
      }

      // 3. Also include metadata.product_name from leads as fallback
      const { data: leadsData } = await (supabase as any)
        .from('lead_stage_positions')
        .select('lead:leads(metadata)')
        .eq('funnel_id', funnelId);
      for (const row of leadsData || []) {
        const productName = row.lead?.metadata?.product_name;
        if (productName && typeof productName === 'string' && productName.trim()) {
          names.add(productName.trim());
        }
      }

      // 4. Filter by lead_funnel_products configured for this funnel
      const { data: funnelProducts } = await (supabase as any)
        .from('lead_funnel_products')
        .select('product_name_contains, source_funnel_product_id')
        .eq('lead_funnel_id', funnelId);

      const fragments = (funnelProducts || [])
        .map((fp: any) => fp.product_name_contains?.trim()?.toLowerCase())
        .filter(Boolean) as string[];

      if (fragments.length > 0) {
        const filtered = Array.from(names).filter(name => {
          const lower = name.toLowerCase();
          // Bidirecional: nome contém fragmento OU fragmento contém nome
          return fragments.some(frag => lower.includes(frag) || frag.includes(lower));
        });
        // Se o filtro eliminou tudo, retorna todos (fallback)
        if (filtered.length > 0) return filtered.sort();
      }

      return Array.from(names).sort();
    },
    enabled: !!funnelId,
  });
}

export function useSaveLeadProductMappings() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      funnelId,
      mappings,
    }: {
      funnelId: string;
      mappings: { raw_product_name: string; lead_funnel_product_id: string }[];
    }) => {
      // Delete existing mappings for this funnel
      await (supabase as any)
        .from('lead_product_mappings')
        .delete()
        .eq('lead_funnel_id', funnelId);

      if (mappings.length === 0) return [];

      const { data, error } = await (supabase as any)
        .from('lead_product_mappings')
        .insert(
          mappings.map(m => ({
            lead_funnel_id: funnelId,
            raw_product_name: m.raw_product_name,
            lead_funnel_product_id: m.lead_funnel_product_id,
          }))
        )
        .select();
      if (error) throw error;
      return data;
    },
    onSuccess: (_, { funnelId }) => {
      queryClient.invalidateQueries({ queryKey: ['lead-product-mappings', funnelId] });
    },
  });
}
