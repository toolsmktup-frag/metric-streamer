import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

// Revisão das classificações do motor de IA (classify-sales).
// Pendentes vêm de product_funnel_suggestions; auto-aplicadas de
// funnel_products (source='ai_auto'). Confirmar/editar grava em
// funnel_products (a view v_all_sales_classified lê de lá em tempo real),
// então o dashboard e a próxima rodada da IA já usam o ajuste.

export type Role = 'front' | 'order_bump' | 'upsell1' | 'upsell2' | 'upsell3' | 'downsell' | 'other';

export const ROLE_LABELS: Record<Role, string> = {
  front: 'Principal (front)',
  order_bump: 'Order Bump',
  upsell1: 'Upsell 1',
  upsell2: 'Upsell 2',
  upsell3: 'Upsell 3',
  downsell: 'Downsell',
  other: 'Não pertence (other)',
};

export interface Suggestion {
  id: string;
  platform: string | null;
  product_id: string | null;
  product_name: string | null;
  sales_count: number | null;
  revenue: number | null;
  suggested_funnel_id: string | null;
  suggested_funnel_name: string | null;
  suggested_role: string | null;
  confidence: string | null;
  reasoning: string | null;
  status: string;
}

export interface AutoMapping {
  id: string;
  funnel_id: string;
  funnel_name?: string;
  product_id: string | null;
  platform: string | null;
  role: string;
  display_name: string | null;
  ai_confidence: string | null;
}

export interface FunnelOption { id: string; name: string; is_active: boolean; }

export interface ProductMapping {
  id: string;
  funnel_id: string;
  funnel_name?: string;
  product_id: string | null;
  platform: string | null;
  role: string;
  display_name: string | null;
  product_name_contains: string | null;
  source: string | null;
}

/** Todos os produtos mapeados, por funil (p/ revisão completa da classificação). */
export function useAllProductMappings() {
  return useQuery({
    queryKey: ['all-product-mappings'],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('funnel_products')
        .select('id, funnel_id, product_id, platform, role, display_name, product_name_contains, source, funnels(name)')
        .order('role');
      if (error) throw error;
      return (data || []).map((r: any) => ({ ...r, funnel_name: r.funnels?.name })) as ProductMapping[];
    },
    staleTime: 30_000,
  });
}

export function useFunnelOptions() {
  return useQuery({
    queryKey: ['funnel-options'],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('funnels').select('id, name, is_active').order('name');
      if (error) throw error;
      return (data || []) as FunnelOption[];
    },
    staleTime: 60_000,
  });
}

/** Sugestões aguardando revisão (a IA não teve confiança p/ auto-aplicar). */
export function usePendingSuggestions() {
  return useQuery({
    queryKey: ['ai-suggestions', 'pending'],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('product_funnel_suggestions')
        .select('*')
        .eq('status', 'pending')
        .order('revenue', { ascending: false, nullsFirst: false });
      if (error) throw error;
      return (data || []) as Suggestion[];
    },
    staleTime: 30_000,
  });
}

/** Mapeamentos que a IA aplicou automaticamente (p/ auditar/corrigir). */
export function useAutoMappings() {
  return useQuery({
    queryKey: ['ai-auto-mappings'],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('funnel_products')
        .select('id, funnel_id, product_id, platform, role, display_name, ai_confidence, funnels(name)')
        .eq('source', 'ai_auto');
      if (error) throw error;
      return (data || []).map((r: any) => ({ ...r, funnel_name: r.funnels?.name })) as AutoMapping[];
    },
    staleTime: 30_000,
  });
}

function invalidate(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: ['ai-suggestions'] });
  qc.invalidateQueries({ queryKey: ['ai-auto-mappings'] });
  qc.invalidateQueries({ queryKey: ['all-product-mappings'] });
  qc.invalidateQueries({ queryKey: ['all-funnel-products'] });
  qc.invalidateQueries({ queryKey: ['all-sales'] });
}

/** Confirma/edita: grava em funnel_products (source='manual') e marca a sugestão aplicada. */
export function useApproveClassification() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (p: {
      suggestionId?: string; funnel_id: string; role: Role;
      product_id: string | null; platform: string | null; product_name: string;
    }) => {
      if (p.role === 'other' || !p.funnel_id) {
        throw new Error('Escolha um funil e um papel (use "Ignorar" se não pertence a nenhum funil).');
      }
      const { error: insErr } = await (supabase as any).from('funnel_products').insert({
        funnel_id: p.funnel_id,
        product_id: p.product_id,
        platform: p.platform,
        role: p.role,
        product_name_contains: p.product_name,
        display_name: p.product_name,
        source: 'manual',
      });
      if (insErr) throw insErr;
      if (p.suggestionId) {
        await (supabase as any).from('product_funnel_suggestions')
          .update({ status: 'applied', decided_at: new Date().toISOString() })
          .eq('id', p.suggestionId);
      }
    },
    onSuccess: () => invalidate(qc),
  });
}

/** Ignora a sugestão (produto fica como 'other'). */
export function useRejectSuggestion() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (suggestionId: string) => {
      const { error } = await (supabase as any).from('product_funnel_suggestions')
        .update({ status: 'rejected', decided_at: new Date().toISOString() })
        .eq('id', suggestionId);
      if (error) throw error;
    },
    onSuccess: () => invalidate(qc),
  });
}

/** Corrige um mapeamento que a IA aplicou (muda funil/papel; passa a 'manual'). */
export function useUpdateMapping() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (p: { id: string; funnel_id: string; role: Role }) => {
      const { error } = await (supabase as any).from('funnel_products')
        .update({ funnel_id: p.funnel_id, role: p.role, source: 'manual' })
        .eq('id', p.id);
      if (error) throw error;
    },
    onSuccess: () => invalidate(qc),
  });
}

/** Remove um mapeamento (produto volta a 'other'). */
export function useDeleteMapping() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any).from('funnel_products').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => invalidate(qc),
  });
}

/** Dispara o motor agora (gera sugestões p/ produtos novos sem classificação). */
export function useRunClassifier() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const { data, error } = await (supabase as any).functions.invoke('classify-sales', {
        body: { auto_apply: false },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => invalidate(qc),
  });
}
