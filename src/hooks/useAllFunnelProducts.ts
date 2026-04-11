import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface FunnelProductOption {
  id: string;
  product_id: string | null;
  product_name_contains: string;
  display_name: string | null;
  role: string;
  funnel_id: string;
  funnel_name: string;
  platform: string;
}

/**
 * Busca todos os produtos cadastrados em funnel_products, 
 * com join no funil para exibir nome e plataforma.
 */
export function useAllFunnelProducts() {
  return useQuery({
    queryKey: ['all-funnel-products'],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('funnel_products')
        .select('id, product_id, product_name_contains, display_name, role, funnel_id, funnels(name, platform)');
      if (error) throw error;
      return (data || []).map((row: any) => ({
        id: row.id,
        product_id: row.product_id,
        product_name_contains: row.product_name_contains,
        display_name: row.display_name,
        role: row.role,
        funnel_id: row.funnel_id,
        funnel_name: row.funnels?.name || 'Sem funil',
        platform: row.funnels?.platform || 'outro',
      })) as FunnelProductOption[];
    },
    staleTime: 5 * 60 * 1000,
  });
}
