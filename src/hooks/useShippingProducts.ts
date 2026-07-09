import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface ShippingProduct {
  id: string;
  product_name_contains: string;
  display_name: string | null;
  active: boolean;
  created_at: string;
  /** vendas pagas cujo nome de produto bate no padrão */
  matches: number;
}

/** Catálogo de produtos que geram pedido de envio (tela Rastreios). */
export function useShippingProducts() {
  return useQuery({
    queryKey: ['shipping-products'],
    queryFn: async (): Promise<ShippingProduct[]> => {
      const { data, error } = await (supabase as any)
        .from('shipping_products')
        .select('*')
        .order('created_at', { ascending: true });
      if (error) throw error;

      const rows = (data || []) as Omit<ShippingProduct, 'matches'>[];
      const withCounts = await Promise.all(
        rows.map(async (r) => {
          const { count } = await (supabase as any)
            .from('customer_purchases')
            .select('id', { count: 'exact', head: true })
            .eq('status', 'authorized')
            .ilike('product_name', `%${r.product_name_contains}%`);
          return { ...r, matches: count || 0 };
        }),
      );
      return withCounts;
    },
    staleTime: 60 * 1000,
  });
}

export function useAddShippingProduct() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ pattern, displayName }: { pattern: string; displayName: string }) => {
      const clean = pattern.trim().toLowerCase();
      if (clean.length < 4) throw new Error('Padrão muito curto — use pelo menos 4 letras (ex.: "articulabem")');
      const { error } = await (supabase as any)
        .from('shipping_products')
        .insert({ product_name_contains: clean, display_name: displayName.trim() || clean });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['shipping-products'] });
      toast.success('Produto adicionado ao catálogo de envios');
    },
    onError: (e: any) => toast.error(e?.message || 'Erro ao adicionar produto'),
  });
}

export function useToggleShippingProduct() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, active }: { id: string; active: boolean }) => {
      const { error } = await (supabase as any)
        .from('shipping_products')
        .update({ active })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['shipping-products'] }),
    onError: (e: any) => toast.error(e?.message || 'Erro ao atualizar produto'),
  });
}

export function useDeleteShippingProduct() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any).from('shipping_products').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['shipping-products'] });
      toast.success('Produto removido do catálogo');
    },
    onError: (e: any) => toast.error(e?.message || 'Erro ao remover produto'),
  });
}

/**
 * Puxa pras tela as vendas pagas que ainda não têm pedido de envio
 * (corte operacional padrão: 10/06/2026). Nada dispara sozinho — os
 * pedidos entram como "aguardando rastreio".
 */
export function useSyncShipments() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (): Promise<number> => {
      const { data, error } = await (supabase as any).rpc('sync_shipments_from_purchases');
      if (error) throw error;
      return Number(data ?? 0);
    },
    onSuccess: (n) => {
      qc.invalidateQueries({ queryKey: ['order-shipments'] });
      qc.invalidateQueries({ queryKey: ['order-shipments-counts'] });
      toast.success(n > 0 ? `${n} pedido${n > 1 ? 's' : ''} novo${n > 1 ? 's' : ''} na tela` : 'Nenhum pedido novo — tudo em dia');
    },
    onError: (e: any) => toast.error(e?.message || 'Erro ao sincronizar vendas'),
  });
}
