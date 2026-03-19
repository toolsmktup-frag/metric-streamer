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
      products: (Omit<LeadFunnelProduct, 'lead_funnel_id' | 'created_at'> & { id?: string })[];
    }) => {
      // Fetch current products to diff
      const { data: existing } = await (supabase as any)
        .from('lead_funnel_products')
        .select('id')
        .eq('lead_funnel_id', funnelId);
      const existingIds = new Set((existing || []).map((e: any) => e.id));

      const toUpdate = products.filter(p => p.id && existingIds.has(p.id));
      const toInsert = products.filter(p => !p.id);
      const keepIds = new Set(products.filter(p => p.id).map(p => p.id));
      const toDeleteIds = ([...existingIds] as string[]).filter(id => !keepIds.has(id));

      // Delete only removed products
      if (toDeleteIds.length > 0) {
        await (supabase as any)
          .from('lead_funnel_products')
          .delete()
          .in('id', toDeleteIds);
      }

      // Update existing
      for (const p of toUpdate) {
        await (supabase as any)
          .from('lead_funnel_products')
          .update({
            source_funnel_product_id: p.source_funnel_product_id,
            product_name_contains: p.product_name_contains,
            display_name: p.display_name,
            recontact_days: p.recontact_days,
            auto_move_stage_id: p.auto_move_stage_id,
          })
          .eq('id', p.id);
      }

      // Insert new
      if (toInsert.length > 0) {
        const { error } = await (supabase as any)
          .from('lead_funnel_products')
          .insert(toInsert.map(p => ({
            lead_funnel_id: funnelId,
            source_funnel_product_id: p.source_funnel_product_id,
            product_name_contains: p.product_name_contains,
            display_name: p.display_name,
            recontact_days: p.recontact_days,
            auto_move_stage_id: p.auto_move_stage_id,
          })));
        if (error) throw error;
      }

      return [];
    },
    onSuccess: (_, { funnelId }) => {
      queryClient.invalidateQueries({ queryKey: ['lead-funnel-products', funnelId] });
    },
  });
}
