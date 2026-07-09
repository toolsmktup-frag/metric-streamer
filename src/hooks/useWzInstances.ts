import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { WzInstance } from '@/types/wz-automation';
import { toast } from 'sonner';

export interface WzInstanceProfile {
  phone_number?: string;
  profile_pic_url?: string;
  status?: string;
}

function normalizeWzStatus(data: any, fallbackStatus?: string) {
  const rawStatus = data?.status || data?.state || data?.instance?.status || data?.instance?.state || data?.data?.status || data?.data?.state;
  if (rawStatus === 'connected' || rawStatus === 'open' || data?.connected === true || data?.status?.connected === true) {
    return 'connected';
  }
  return rawStatus || fallbackStatus || 'disconnected';
}

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

export function useWzInstanceProfiles(instances: WzInstance[]) {
  return useQuery({
    queryKey: ['wz-instance-profiles', instances.map(i => i.id).join(',')],
    queryFn: async () => {
      const profiles: Record<string, WzInstanceProfile> = {};
      await Promise.all(
        instances.map(async (inst) => {
          try {
            const url = inst.api_url.replace(/\/+$/, '');
            const res = await fetch(`${url}/instance/status`, {
              headers: { token: inst.api_key },
            });
            if (!res.ok) {
              profiles[inst.id] = { status: inst.status };
              return;
            }
            const data = await res.json();
            // UazAPI devolve o número em instance.owner ("5548...@s.whatsapp.net")
            const rawPhone = data?.phone || data?.number || data?.instance?.phone
              || data?.instance?.owner || data?.owner || data?.user?.id;
            profiles[inst.id] = {
              phone_number: typeof rawPhone === 'string' ? rawPhone.replace(/@.*$/, '') : undefined,
              profile_pic_url: data?.profilePicUrl || data?.instance?.profilePicUrl || data?.user?.profilePictureUrl || data?.instance?.profilePicUrl,
              status: normalizeWzStatus(data, inst.status),
            };
          } catch {
            profiles[inst.id] = { status: inst.status };
          }
        })
      );
      return profiles;
    },
    enabled: instances.length > 0,
    refetchInterval: 30000,
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
    if (!res.ok) return false;
    const data = await res.json();
    return normalizeWzStatus(data) === 'connected';
  } catch {
    return false;
  }
}