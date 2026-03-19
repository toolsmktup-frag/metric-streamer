import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface FunnelAccessRecord {
  id: string;
  user_id: string;
  campaign_id: string | null;
  funnel_id: string | null;
  organization_id: string;
  created_at: string;
}

/** All access records for the org (admin view) */
export function useOrgFunnelAccess() {
  return useQuery({
    queryKey: ['org-funnel-access'],
    queryFn: async (): Promise<FunnelAccessRecord[]> => {
      const { data: orgId } = await (supabase as any).rpc('get_user_org_id');
      if (!orgId) return [];
      const { data, error } = await (supabase as any)
        .from('lead_funnel_access')
        .select('*')
        .eq('organization_id', orgId);
      if (error) throw error;
      return data || [];
    },
  });
}

/** Current user's access records (for filtering) */
export function useMyFunnelAccess() {
  return useQuery({
    queryKey: ['my-funnel-access'],
    queryFn: async (): Promise<FunnelAccessRecord[]> => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return [];
      const { data, error } = await (supabase as any)
        .from('lead_funnel_access')
        .select('*')
        .eq('user_id', user.id);
      if (error) throw error;
      return data || [];
    },
    staleTime: 30_000,
  });
}

export function useGrantFunnelAccess() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: { userId: string; campaignId?: string; funnelId?: string; organizationId: string }) => {
      const row: any = {
        user_id: params.userId,
        organization_id: params.organizationId,
      };
      if (params.campaignId) row.campaign_id = params.campaignId;
      if (params.funnelId) row.funnel_id = params.funnelId;
      const { error } = await (supabase as any).from('lead_funnel_access').insert(row);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['org-funnel-access'] });
      toast.success('Acesso concedido');
    },
    onError: (err: any) => toast.error(err.message || 'Erro ao conceder acesso'),
  });
}

export function useRevokeFunnelAccess() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: { userId: string; campaignId?: string; funnelId?: string }) => {
      let query = (supabase as any).from('lead_funnel_access').delete().eq('user_id', params.userId);
      if (params.campaignId) query = query.eq('campaign_id', params.campaignId);
      if (params.funnelId) query = query.eq('funnel_id', params.funnelId);
      const { error } = await query;
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['org-funnel-access'] });
      toast.success('Acesso removido');
    },
    onError: (err: any) => toast.error(err.message || 'Erro ao remover acesso'),
  });
}

/**
 * Check if current user has access to a given funnel.
 * Admins/gestors always return true.
 */
export function useHasFunnelAccess(funnelId: string | null) {
  return useQuery({
    queryKey: ['has-funnel-access', funnelId],
    queryFn: async (): Promise<boolean> => {
      if (!funnelId) return false;
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return false;
      const { data, error } = await (supabase as any).rpc('has_funnel_access', {
        _user_id: user.id,
        _funnel_id: funnelId,
      });
      if (error) throw error;
      return !!data;
    },
    enabled: !!funnelId,
    staleTime: 30_000,
  });
}
