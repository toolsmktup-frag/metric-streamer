import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { WzFlow } from '@/types/wz-automation';
import { toast } from 'sonner';

export function useWzFlows() {
  return useQuery({
    queryKey: ['wz-flows'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('wz_flows' as any)
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data || []) as unknown as WzFlow[];
    },
  });
}

export function useWzFlow(id: string | undefined) {
  return useQuery({
    queryKey: ['wz-flow', id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('wz_flows' as any)
        .select('*')
        .eq('id', id!)
        .single();
      if (error) throw error;
      return data as unknown as WzFlow;
    },
  });
}

export function useCreateWzFlow() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (flow: Partial<WzFlow>) => {
      const { data, error } = await supabase
        .from('wz_flows' as any)
        .insert(flow as any)
        .select()
        .single();
      if (error) throw error;
      return data as unknown as WzFlow;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['wz-flows'] });
    },
  });
}

export function useUpdateWzFlow() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...updates }: Partial<WzFlow> & { id: string }) => {
      const { error } = await supabase
        .from('wz_flows' as any)
        .update({ ...updates, updated_at: new Date().toISOString() } as any)
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['wz-flows'] });
      qc.invalidateQueries({ queryKey: ['wz-flow', vars.id] });
    },
  });
}

export function useDeleteWzFlow() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('wz_flows' as any)
        .delete()
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['wz-flows'] });
      toast.success('Fluxo removido');
    },
  });
}

export function useToggleWzFlow() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      const { error } = await supabase
        .from('wz_flows' as any)
        .update({ is_active, updated_at: new Date().toISOString() } as any)
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['wz-flows'] });
    },
  });
}

export function useDuplicateWzFlow() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: string | { id: string; targetFunnelId?: string | null; showInAutomations?: boolean }) => {
      const id = typeof params === 'string' ? params : params.id;
      const targetFunnelId = typeof params === 'string' ? null : params.targetFunnelId;
      const showInAutomations = typeof params === 'string' ? true : params.showInAutomations ?? true;
      const { data: original, error: fetchError } = await supabase
        .from('wz_flows' as any)
        .select('*')
        .eq('id', id)
        .single();
      if (fetchError) throw fetchError;
      const { id: _id, created_at, updated_at, ...rest } = original as any;
      const { data, error } = await supabase
        .from('wz_flows' as any)
        .insert({ ...rest, name: `${rest.name} (cópia)`, is_active: false } as any)
        .select()
        .single();
      if (error) throw error;

      if (targetFunnelId) {
        const { error: linkError } = await (supabase as any)
          .from('lead_funnel_automations')
          .insert({
            funnel_id: targetFunnelId,
            wz_flow_id: (data as any).id,
            trigger_events: [],
            show_in_automations: showInAutomations,
          });

        if (linkError) {
          await supabase.from('wz_flows' as any).delete().eq('id', (data as any).id);
          throw linkError;
        }
      }

      return data as unknown as WzFlow;
    },
    onSuccess: (_, vars) => {
      const targetFunnelId = typeof vars === 'string' ? null : vars.targetFunnelId;
      qc.invalidateQueries({ queryKey: ['wz-flows'] });
      qc.invalidateQueries({ queryKey: ['lead-funnel-automations-visibility'] });
      if (targetFunnelId) {
        qc.invalidateQueries({ queryKey: ['lead-funnel-automations', targetFunnelId] });
      }
      toast.success(targetFunnelId ? 'Automação duplicada e vinculada ao funil' : 'Automação duplicada como avulsa');
    },
  });
}
