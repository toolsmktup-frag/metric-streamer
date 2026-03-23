import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

/**
 * Busca nomes distintos de produtos já recebidos via webhook para um funil específico.
 * Fonte: v_all_sales (unifica Ticto + Guru + outras plataformas).
 * Se funnelId for null, busca de todos os funis.
 */
export function useDistinctProductNames(funnelId?: string | null) {
  return useQuery({
    queryKey: ['distinct-product-names', funnelId ?? 'all'],
    queryFn: async () => {
      let query = (supabase as any)
        .from('v_all_sales')
        .select('product_name');

      if (funnelId) {
        query = query.eq('funnel_id', funnelId);
      }

      // Fetch all rows but we only need product_name
      const { data, error } = await query;
      if (error) throw error;

      const names = new Set<string>();
      for (const row of data || []) {
        if (row.product_name && typeof row.product_name === 'string' && row.product_name.trim()) {
          names.add(row.product_name.trim());
        }
      }
      return Array.from(names).sort();
    },
    staleTime: 5 * 60 * 1000,
  });
}
