import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { LeadFunnelAutomation } from '@/types/wz-automation';
import { toast } from 'sonner';

export function useLeadFunnelAutomations(funnelId: string | null) {
  return useQuery({
    queryKey: ['lead-funnel-automations', funnelId],
    enabled: !!funnelId,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('lead_funnel_automations')
        .select('*, wz_flows(*)')
        .eq('funnel_id', funnelId!)
        .order('created_at', { ascending: true });
      if (error) throw error;
      return ((data || []) as any[]).map((row: any) => ({
        ...row,
        wz_flow: row.wz_flows || null,
      })) as LeadFunnelAutomation[];
    },
  });
}

export function useLinkFunnelAutomation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: { funnel_id: string; wz_flow_id: string; trigger_events?: string[]; show_in_automations?: boolean }) => {
      const { data, error } = await (supabase as any)
        .from('lead_funnel_automations')
        .insert({
          funnel_id: params.funnel_id,
          wz_flow_id: params.wz_flow_id,
          trigger_events: params.trigger_events || [],
          show_in_automations: params.show_in_automations ?? false,
        })
        .select()
        .single();
      if (error) throw error;
      return data as LeadFunnelAutomation;
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['lead-funnel-automations', vars.funnel_id] });
      toast.success('Automação vinculada!');
    },
    onError: () => toast.error('Erro ao vincular automação'),
  });
}

export function useUpdateFunnelAutomation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, funnel_id, ...updates }: Partial<LeadFunnelAutomation> & { id: string; funnel_id: string }) => {
      const { error } = await (supabase as any)
        .from('lead_funnel_automations')
        .update(updates)
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['lead-funnel-automations', vars.funnel_id] });
    },
  });
}

export function useUnlinkFunnelAutomation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, funnel_id }: { id: string; funnel_id: string }) => {
      const { error } = await (supabase as any)
        .from('lead_funnel_automations')
        .delete()
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['lead-funnel-automations', vars.funnel_id] });
      toast.success('Automação desvinculada');
    },
  });
}
