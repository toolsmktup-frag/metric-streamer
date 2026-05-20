import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { PaymentPlatform } from '@/hooks/useFunnels';

export type CatalogRole = 'front' | 'order_bump' | 'upsell1' | 'upsell2' | 'upsell3' | 'downsell';

export interface ProductCatalogItem {
  id: string;
  product_id: string | null;
  platform: PaymentPlatform;
  display_name: string;
  product_name_contains: string;
  default_role: CatalogRole | null;
  recontact_days: number | null;
  notes: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export function useProductsCatalog(includeInactive = false) {
  return useQuery({
    queryKey: ['products-catalog', includeInactive],
    queryFn: async () => {
      let q = (supabase as any).from('products_catalog').select('*').order('display_name', { ascending: true });
      if (!includeInactive) q = q.eq('is_active', true);
      const { data, error } = await q;
      if (error) throw error;
      return (data || []) as ProductCatalogItem[];
    },
    staleTime: 60_000,
  });
}

export function useUpsertProductCatalog() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (item: Partial<ProductCatalogItem> & { display_name: string; product_name_contains: string; platform: PaymentPlatform }) => {
      const payload = {
        product_id: item.product_id || null,
        platform: item.platform,
        display_name: item.display_name.trim(),
        product_name_contains: item.product_name_contains.trim(),
        default_role: item.default_role || null,
        recontact_days: item.recontact_days ?? null,
        notes: item.notes || null,
        is_active: item.is_active ?? true,
      };
      if (item.id) {
        const { data, error } = await (supabase as any)
          .from('products_catalog')
          .update(payload)
          .eq('id', item.id)
          .select()
          .single();
        if (error) throw error;
        return data as ProductCatalogItem;
      }
      const { data, error } = await (supabase as any)
        .from('products_catalog')
        .insert(payload)
        .select()
        .single();
      if (error) throw error;
      return data as ProductCatalogItem;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['products-catalog'] });
      qc.invalidateQueries({ queryKey: ['all-funnel-products'] });
    },
  });
}

export function useDeleteProductCatalog() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any)
        .from('products_catalog')
        .update({ is_active: false })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['products-catalog'] });
      qc.invalidateQueries({ queryKey: ['all-funnel-products'] });
    },
  });
}
