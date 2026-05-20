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
 * Busca produtos para popular seletores (WhatsApp automation, etc):
 * - funnel_products: produtos vinculados a funis de tráfego
 * - products_catalog: produtos avulsos (cadastrados sem funil de tráfego)
 *
 * Produtos do catálogo aparecem agrupados como "Catálogo (plataforma)".
 */
export function useAllFunnelProducts() {
  return useQuery({
    queryKey: ['all-funnel-products'],
    queryFn: async () => {
      const [fpRes, catRes] = await Promise.all([
        (supabase as any)
          .from('funnel_products')
          .select('id, product_id, product_name_contains, display_name, role, funnel_id, funnels(name, platform)'),
        (supabase as any)
          .from('products_catalog')
          .select('id, product_id, product_name_contains, display_name, default_role, platform')
          .eq('is_active', true),
      ]);

      if (fpRes.error) throw fpRes.error;
      if (catRes.error && catRes.error.code !== '42P01') throw catRes.error; // ignora se a tabela ainda não existe

      const fromFunnels: FunnelProductOption[] = (fpRes.data || []).map((row: any) => ({
        id: row.id,
        product_id: row.product_id,
        product_name_contains: row.product_name_contains,
        display_name: row.display_name,
        role: row.role,
        funnel_id: row.funnel_id,
        funnel_name: row.funnels?.name || 'Sem funil',
        platform: row.funnels?.platform || 'outro',
      }));

      // Dedup: produto já presente em funnel_products (por product_id+platform) não duplica
      const existingKeys = new Set(
        fromFunnels
          .filter(p => p.product_id)
          .map(p => `${p.product_id}|${p.platform}`)
      );

      const fromCatalog: FunnelProductOption[] = (catRes.data || [])
        .filter((row: any) => !row.product_id || !existingKeys.has(`${row.product_id}|${row.platform}`))
        .map((row: any) => ({
          id: `catalog:${row.id}`,
          product_id: row.product_id,
          product_name_contains: row.product_name_contains,
          display_name: row.display_name,
          role: row.default_role || 'front',
          funnel_id: '',
          funnel_name: 'Catálogo',
          platform: row.platform || 'outro',
        }));

      return [...fromFunnels, ...fromCatalog];
    },
    staleTime: 5 * 60 * 1000,
  });
}
