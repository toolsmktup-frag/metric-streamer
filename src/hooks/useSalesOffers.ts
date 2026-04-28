import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export type OfferStatus = 'draft' | 'active' | 'paused' | 'archived';

export interface SalesOffer {
  id: string;
  organization_id: string;
  name: string;
  status: OfferStatus;
  is_featured: boolean;
  short_description: string | null;
  price_promo: string | null;
  price_full: string | null;
  access_period: string | null;
  composition: string | null;
  target_audience: string | null;
  ai_rules: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface OfferInput {
  name: string;
  status?: OfferStatus;
  is_featured?: boolean;
  short_description?: string | null;
  price_promo?: string | null;
  price_full?: string | null;
  access_period?: string | null;
  composition?: string | null;
  target_audience?: string | null;
  ai_rules?: string | null;
  sort_order?: number;
}

async function getOrgId(): Promise<string> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Não autenticado');
  const { data: profile } = await (supabase as any)
    .from('user_profiles')
    .select('organization_id')
    .eq('id', user.id)
    .maybeSingle();
  if (!profile?.organization_id) throw new Error('Organização não encontrada');
  return profile.organization_id;
}

export function useSalesOffers() {
  return useQuery({
    queryKey: ['sales-copilot-offers'],
    queryFn: async (): Promise<SalesOffer[]> => {
      const { data, error } = await (supabase as any)
        .from('sales_copilot_offers')
        .select('*')
        .order('is_featured', { ascending: false })
        .order('sort_order', { ascending: true })
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data || [];
    },
    staleTime: 30 * 1000,
  });
}

export function useCreateOffer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: OfferInput) => {
      const orgId = await getOrgId();
      const { data: { user } } = await supabase.auth.getUser();
      const { error } = await (supabase as any)
        .from('sales_copilot_offers')
        .insert({
          organization_id: orgId,
          created_by: user?.id ?? null,
          status: 'active',
          is_featured: false,
          sort_order: 0,
          ...input,
        });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['sales-copilot-offers'] });
      toast.success('Oferta criada');
    },
    onError: (e: any) => toast.error(e.message || 'Erro ao criar oferta'),
  });
}

export function useUpdateOffer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...patch }: { id: string } & Partial<OfferInput>) => {
      const { error } = await (supabase as any)
        .from('sales_copilot_offers')
        .update(patch)
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['sales-copilot-offers'] });
      toast.success('Oferta atualizada');
    },
    onError: (e: any) => toast.error(e.message || 'Erro ao atualizar'),
  });
}

export function useDeleteOffer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any)
        .from('sales_copilot_offers')
        .delete()
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['sales-copilot-offers'] });
      toast.success('Oferta removida');
    },
    onError: (e: any) => toast.error(e.message || 'Erro ao remover'),
  });
}

export function useToggleOfferActive() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, active }: { id: string; active: boolean }) => {
      const { error } = await (supabase as any)
        .from('sales_copilot_offers')
        .update({ status: active ? 'active' : 'paused' })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['sales-copilot-offers'] }),
    onError: (e: any) => toast.error(e.message || 'Erro ao alternar'),
  });
}

// Apenas 1 oferta featured por org — limpa as outras antes de marcar
export function useSetFeaturedOffer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, featured }: { id: string; featured: boolean }) => {
      if (featured) {
        const orgId = await getOrgId();
        // limpa qualquer outra featured na org
        const { error: clearErr } = await (supabase as any)
          .from('sales_copilot_offers')
          .update({ is_featured: false })
          .eq('organization_id', orgId)
          .eq('is_featured', true);
        if (clearErr) throw clearErr;
      }
      const { error } = await (supabase as any)
        .from('sales_copilot_offers')
        .update({ is_featured: featured })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['sales-copilot-offers'] }),
    onError: (e: any) => toast.error(e.message || 'Erro ao destacar'),
  });
}

export function useDuplicateOffer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (offer: SalesOffer) => {
      const orgId = await getOrgId();
      const { data: { user } } = await supabase.auth.getUser();
      const { error } = await (supabase as any)
        .from('sales_copilot_offers')
        .insert({
          organization_id: orgId,
          created_by: user?.id ?? null,
          name: `${offer.name} (cópia)`,
          status: 'draft',
          is_featured: false,
          short_description: offer.short_description,
          price_promo: offer.price_promo,
          price_full: offer.price_full,
          access_period: offer.access_period,
          composition: offer.composition,
          target_audience: offer.target_audience,
          ai_rules: offer.ai_rules,
          sort_order: offer.sort_order,
        });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['sales-copilot-offers'] });
      toast.success('Oferta duplicada');
    },
    onError: (e: any) => toast.error(e.message || 'Erro ao duplicar'),
  });
}
