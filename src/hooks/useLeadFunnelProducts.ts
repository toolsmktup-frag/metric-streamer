import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface LeadFunnelProduct {
  id: string;
  lead_funnel_id: string;
  source_funnel_product_id: string | null;
  product_name_contains: string;
  display_name: string | null;
  recontact_days: number | null;
  auto_move_stage_id: string | null;
  created_at: string;
}

export function useLeadFunnelProducts(funnelId: string | null) {
  return useQuery({
    queryKey: ['lead-funnel-products', funnelId],
    queryFn: async () => {
      if (!funnelId) return [];
      const { data, error } = await (supabase as any)
        .from('lead_funnel_products')
        .select('*')
        .eq('lead_funnel_id', funnelId);
      if (error) throw error;
      return (data || []) as LeadFunnelProduct[];
    },
    enabled: !!funnelId,
  });
}

export function useUpsertLeadFunnelProducts() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      funnelId,
      products,
    }: {
      funnelId: string;
      products: Omit<LeadFunnelProduct, 'id' | 'lead_funnel_id' | 'created_at'>[];
    }) => {
      // Delete existing and re-insert
      await (supabase as any).from('lead_funnel_products').delete().eq('lead_funnel_id', funnelId);
      if (products.length === 0) return [];
      const { data, error } = await (supabase as any)
        .from('lead_funnel_products')
        .insert(products.map(p => ({ ...p, lead_funnel_id: funnelId })))
        .select();
      if (error) throw error;
      return data;
    },
    onSuccess: (_, { funnelId }) => {
      queryClient.invalidateQueries({ queryKey: ['lead-funnel-products', funnelId] });
    },
  });
}
