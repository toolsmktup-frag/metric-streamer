import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export type PaymentPlatform = 'ticto' | 'guru' | 'kiwify' | 'hotmart' | 'eduzz' | 'youshop' | 'outro';

export interface FunnelProduct {
  id: string;
  funnel_id: string;
  product_id: string | null;
  product_name_contains: string;
  role: 'front' | 'order_bump' | 'upsell1' | 'upsell2' | 'upsell3' | 'downsell';
  display_name: string | null;
  recontact_days: number | null;
  /** NULL = aplica a todas as plataformas. Caso contrário, apenas àquela plataforma. */
  platform?: PaymentPlatform | null;
}

export interface FunnelPlatform {
  id: string;
  funnel_id: string;
  platform: PaymentPlatform;
  webhook_token: string;
  is_active: boolean;
  created_at: string;
}

export interface Funnel {
  id: string;
  name: string;
  description: string | null;
  color: string;
  meta_account_id: string | null;
  is_active: boolean;
  sort_order: number;
  created_at: string;
  funnel_products?: FunnelProduct[];
  funnel_platforms?: FunnelPlatform[];
}

export function useFunnels() {
  return useQuery({
    queryKey: ['funnels'],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('funnels')
        .select('*, funnel_products(*), funnel_platforms(*)')
        .eq('is_active', true)
        .order('sort_order', { ascending: true });

      if (error) throw error;
      return (data || []) as Funnel[];
    },
    staleTime: 5 * 60 * 1000,
  });
}

export function useFunnel(id: string | null) {
  return useQuery({
    queryKey: ['funnel', id],
    queryFn: async () => {
      if (!id) return null;
      const { data, error } = await (supabase as any)
        .from('funnels')
        .select('*, funnel_products(*), funnel_platforms(*)')
        .eq('id', id)
        .single();

      if (error) throw error;
      return data as Funnel;
    },
    enabled: !!id,
    staleTime: 5 * 60 * 1000,
  });
}

export function useCreateFunnel() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (
      funnel: Partial<Funnel> & { initial_platform?: PaymentPlatform }
    ) => {
      const { initial_platform, ...funnelData } = funnel;
      const { data, error } = await (supabase as any)
        .from('funnels')
        .insert(funnelData)
        .select()
        .single();
      if (error) throw error;

      // Cria automaticamente a plataforma inicial em funnel_platforms
      // (sem isso, o funil novo nasce sem webhook)
      if (initial_platform && data?.id) {
        const { error: platErr } = await (supabase as any)
          .from('funnel_platforms')
          .insert({ funnel_id: data.id, platform: initial_platform });
        if (platErr) throw platErr;
      }
      return data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['funnels'] }),
  });
}

export function useUpdateFunnel() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...updates }: Partial<Funnel> & { id: string }) => {
      const { data, error } = await (supabase as any)
        .from('funnels')
        .update({ ...updates, updated_at: new Date().toISOString() })
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: ['funnels'] });
      queryClient.invalidateQueries({ queryKey: ['funnel', id] });
    },
  });
}

export function useDeleteFunnel() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any)
        .from('funnels')
        .update({ is_active: false, updated_at: new Date().toISOString() })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['funnels'] }),
  });
}

export function useUpsertFunnelProducts() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ funnelId, products }: { funnelId: string; products: Omit<FunnelProduct, 'id' | 'funnel_id'>[] }) => {
      // Delete existing and re-insert (simpler than diff)
      await (supabase as any).from('funnel_products').delete().eq('funnel_id', funnelId);
      if (products.length === 0) return [];
      const { data, error } = await (supabase as any)
        .from('funnel_products')
        .insert(products.map(p => ({ ...p, funnel_id: funnelId })))
        .select();
      if (error) throw error;
      return data;
    },
    onSuccess: (_, { funnelId }) => {
      queryClient.invalidateQueries({ queryKey: ['funnels'] });
      queryClient.invalidateQueries({ queryKey: ['funnel', funnelId] });
    },
  });
}

// ===========================================================
// Multi-plataforma por funil (funnel_platforms)
// ===========================================================

export function useAddFunnelPlatform() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ funnelId, platform }: { funnelId: string; platform: PaymentPlatform }) => {
      const { data, error } = await (supabase as any)
        .from('funnel_platforms')
        .insert({ funnel_id: funnelId, platform })
        .select()
        .single();
      if (error) throw error;
      return data as FunnelPlatform;
    },
    onSuccess: (_, { funnelId }) => {
      queryClient.invalidateQueries({ queryKey: ['funnels'] });
      queryClient.invalidateQueries({ queryKey: ['funnel', funnelId] });
    },
  });
}

export function useRegenerateFunnelPlatformToken() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, funnelId }: { id: string; funnelId: string }) => {
      // Generates a new UUID-based token
      const newToken = crypto.randomUUID();
      const { data, error } = await (supabase as any)
        .from('funnel_platforms')
        .update({ webhook_token: newToken, updated_at: new Date().toISOString() })
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      return data as FunnelPlatform;
    },
    onSuccess: (_, { funnelId }) => {
      queryClient.invalidateQueries({ queryKey: ['funnels'] });
      queryClient.invalidateQueries({ queryKey: ['funnel', funnelId] });
    },
  });
}

export function useDeleteFunnelPlatform() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id }: { id: string; funnelId: string }) => {
      const { error } = await (supabase as any)
        .from('funnel_platforms')
        .delete()
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: (_, { funnelId }) => {
      queryClient.invalidateQueries({ queryKey: ['funnels'] });
      queryClient.invalidateQueries({ queryKey: ['funnel', funnelId] });
    },
  });
}
