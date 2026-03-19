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

/** Fetch distinct product_name values from lead metadata for a given funnel */
export function useDistinctLeadProducts(funnelId: string | null) {
  return useQuery({
    queryKey: ['distinct-lead-products', funnelId],
    queryFn: async () => {
      if (!funnelId) return [];
      // Get all leads in this funnel via lead_stage_positions -> leads
      const { data, error } = await (supabase as any)
        .from('lead_stage_positions')
        .select('lead:leads(metadata)')
        .eq('funnel_id', funnelId);
      if (error) throw error;

      const names = new Set<string>();
      for (const row of data || []) {
        const productName = row.lead?.metadata?.product_name;
        if (productName && typeof productName === 'string' && productName.trim()) {
          names.add(productName.trim());
        }
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
