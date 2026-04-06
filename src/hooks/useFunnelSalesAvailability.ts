import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

interface SalesAvailability {
  firstSaleDate: string | null;
  lastSaleDate: string | null;
  totalApproved: number;
}

/**
 * Consulta leve (sem paginação) para saber se existem vendas aprovadas
 * de um funil, independentemente do filtro de datas atual.
 */
export function useFunnelSalesAvailability(funnelId?: string | null) {
  return useQuery({
    queryKey: ['funnel-sales-availability', funnelId ?? 'none'],
    queryFn: async (): Promise<SalesAvailability> => {
      if (!funnelId) return { firstSaleDate: null, lastSaleDate: null, totalApproved: 0 };

      // Primeira venda aprovada
      const { data: first } = await (supabase as any)
        .from('v_all_sales')
        .select('purchased_at')
        .eq('funnel_id', funnelId)
        .eq('status', 'authorized')
        .order('purchased_at', { ascending: true })
        .limit(1);

      // Última venda aprovada
      const { data: last } = await (supabase as any)
        .from('v_all_sales')
        .select('purchased_at')
        .eq('funnel_id', funnelId)
        .eq('status', 'authorized')
        .order('purchased_at', { ascending: false })
        .limit(1);

      // Contagem total
      const { count } = await (supabase as any)
        .from('v_all_sales')
        .select('id', { count: 'exact', head: true })
        .eq('funnel_id', funnelId)
        .eq('status', 'authorized');

      return {
        firstSaleDate: first?.[0]?.purchased_at ?? null,
        lastSaleDate: last?.[0]?.purchased_at ?? null,
        totalApproved: count ?? 0,
      };
    },
    staleTime: 60 * 1000,
    gcTime: 5 * 60 * 1000,
    enabled: !!funnelId,
  });
}
