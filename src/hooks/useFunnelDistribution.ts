import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface FunnelDistributionWeight {
  user_id: string;
  full_name: string;
  weight: number;
  assigned_count: number;
}

export interface FunnelDistributionConfig {
  enabled: boolean;
  weights: FunnelDistributionWeight[];
}

/** Lê o toggle + pesos de distribuição de um funil (RPC get_funnel_distribution). */
export function useFunnelDistribution(funnelId?: string) {
  return useQuery({
    queryKey: ['funnel-distribution', funnelId],
    enabled: !!funnelId,
    queryFn: async (): Promise<FunnelDistributionConfig> => {
      const { data, error } = await (supabase as any).rpc('get_funnel_distribution', {
        p_funnel_id: funnelId,
      });
      if (error) throw error;
      return {
        enabled: !!data?.enabled,
        weights: (data?.weights || []) as FunnelDistributionWeight[],
      };
    },
  });
}

/** Salva o toggle + pesos (RPC set_funnel_distribution). Salvar zera os contadores. */
export function useSaveFunnelDistribution() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({
      funnelId,
      enabled,
      weights,
    }: {
      funnelId: string;
      enabled: boolean;
      weights: { user_id: string; weight: number }[];
    }) => {
      const { error } = await (supabase as any).rpc('set_funnel_distribution', {
        p_funnel_id: funnelId,
        p_enabled: enabled,
        p_weights: weights,
      });
      if (error) throw error;
    },
    onSuccess: (_data, { funnelId }) => {
      qc.invalidateQueries({ queryKey: ['funnel-distribution', funnelId] });
      toast.success('Distribuição de leads salva');
    },
    onError: (err: any) => {
      toast.error(err.message || 'Erro ao salvar distribuição');
    },
  });
}
