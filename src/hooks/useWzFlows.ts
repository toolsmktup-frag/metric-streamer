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
