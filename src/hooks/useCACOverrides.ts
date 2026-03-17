import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface CACOverride {
  id: string;
  campaign_id: string;
  campaign_name: string;
  product_key: string;
}

const QUERY_KEY = ['cac-overrides'];

export function useCACOverrides() {
  return useQuery({
    queryKey: QUERY_KEY,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('cac_campaign_overrides')
        .select('id, campaign_id, campaign_name, product_key')
        .order('campaign_name');
      if (error) throw error;
      return (data || []) as CACOverride[];
    },
    staleTime: 5 * 60 * 1000,
  });
}

export function useUpsertCACOverride() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (override: { campaign_id: string; campaign_name: string; product_key: string }) => {
      const { error } = await supabase
        .from('cac_campaign_overrides')
        .upsert(override, { onConflict: 'campaign_id' });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: QUERY_KEY }),
  });
}

export function useDeleteCACOverride() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (campaign_id: string) => {
      const { error } = await supabase
        .from('cac_campaign_overrides')
        .delete()
        .eq('campaign_id', campaign_id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: QUERY_KEY }),
  });
}
