import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { WzInstance } from '@/types/wz-automation';
import { toast } from 'sonner';

export function useWzInstances() {
  return useQuery({
    queryKey: ['wz-instances'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('wz_instances' as any)
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data || []) as unknown as WzInstance[];
    },
  });
}

export function useCreateWzInstance() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (inst: Pick<WzInstance, 'name' | 'api_url' | 'api_key'>) => {
      const { data, error } = await supabase
        .from('wz_instances' as any)
        .insert(inst as any)
        .select()
        .single();
      if (error) throw error;
      return data as unknown as WzInstance;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['wz-instances'] });
      toast.success('Instância criada');
    },
  });
}

export function useUpdateWzInstance() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...updates }: Partial<WzInstance> & { id: string }) => {
      const { error } = await supabase
        .from('wz_instances' as any)
        .update({ ...updates, updated_at: new Date().toISOString() } as any)
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['wz-instances'] });
      toast.success('Instância atualizada');
    },
  });
}

export function useDeleteWzInstance() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('wz_instances' as any)
        .delete()
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['wz-instances'] });
      toast.success('Instância removida');
    },
  });
}

export async function testWzInstanceConnection(apiUrl: string, apiKey: string): Promise<boolean> {
  try {
    const url = apiUrl.replace(/\/+$/, '');
    const res = await fetch(`${url}/instance/status`, {
      headers: { token: apiKey },
    });
    return res.ok;
  } catch {
    return false;
  }
}
