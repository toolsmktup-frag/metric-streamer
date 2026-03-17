import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { LeadCampaign } from '@/types/leadFunnels';

export function useLeadCampaigns() {
  return useQuery({
    queryKey: ['lead-campaigns'],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('lead_campaigns')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data || []) as LeadCampaign[];
    },
  });
}

export function useLeadCampaign(id: string | null) {
  return useQuery({
    queryKey: ['lead-campaign', id],
    queryFn: async () => {
      if (!id) return null;
      const { data, error } = await (supabase as any)
        .from('lead_campaigns')
        .select('*')
        .eq('id', id)
        .single();
      if (error) throw error;
      return data as LeadCampaign;
    },
    enabled: !!id,
  });
}

export function useCreateLeadCampaign() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (campaign: Partial<LeadCampaign>) => {
      const { data: profile } = await supabase.from('user_profiles').select('organization_id').single();
      const { data, error } = await (supabase as any)
        .from('lead_campaigns')
        .insert({ ...campaign, organization_id: profile?.organization_id })
        .select()
        .single();
      if (error) throw error;
      return data as LeadCampaign;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['lead-campaigns'] }),
  });
}

export function useUpdateLeadCampaign() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...updates }: Partial<LeadCampaign> & { id: string }) => {
      const { data, error } = await (supabase as any)
        .from('lead_campaigns')
        .update({ ...updates, updated_at: new Date().toISOString() })
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      return data as LeadCampaign;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['lead-campaigns'] }),
  });
}

export function useDeleteLeadCampaign() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any)
        .from('lead_campaigns')
        .delete()
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['lead-campaigns'] }),
  });
}
