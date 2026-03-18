import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export const MODULE_KEYS = [
  'mod_trafego',
  'mod_anuncios',
  'mod_inteligencia',
  'mod_leads',
  'mod_whatsapp',
  'mod_ferramentas',
] as const;

export type ModuleKey = typeof MODULE_KEYS[number];

export const MODULE_LABELS: Record<ModuleKey, string> = {
  mod_trafego: 'Tráfego',
  mod_anuncios: 'Anúncios',
  mod_inteligencia: 'Inteligência',
  mod_leads: 'Leads',
  mod_whatsapp: 'WhatsApp',
  mod_ferramentas: 'Ferramentas',
};

export interface UserPermissions {
  id: string;
  user_id: string;
  organization_id: string;
  mod_trafego: boolean;
  mod_anuncios: boolean;
  mod_inteligencia: boolean;
  mod_leads: boolean;
  mod_whatsapp: boolean;
  mod_ferramentas: boolean;
}

/** Fetch permissions for all users in the org (admin view) */
export function useOrgPermissions() {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ['org-permissions'],
    queryFn: async (): Promise<UserPermissions[]> => {
      const { data, error } = await (supabase as any)
        .from('user_permissions')
        .select('*');
      if (error) throw error;
      return data || [];
    },
  });

  const updatePermission = useMutation({
    mutationFn: async ({
      permissionId,
      field,
      value,
    }: {
      permissionId: string;
      field: ModuleKey;
      value: boolean;
    }) => {
      const { error } = await (supabase as any)
        .from('user_permissions')
        .update({ [field]: value, updated_at: new Date().toISOString() })
        .eq('id', permissionId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['org-permissions'] });
      toast.success('Permissão atualizada');
    },
    onError: (err: any) => {
      toast.error(err.message || 'Erro ao atualizar permissão');
    },
  });

  return { ...query, updatePermission };
}

/** Fetch permissions for the currently logged-in user */
export function useMyPermissions() {
  return useQuery({
    queryKey: ['my-permissions'],
    queryFn: async (): Promise<UserPermissions | null> => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return null;

      const { data, error } = await (supabase as any)
        .from('user_permissions')
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    staleTime: 2 * 60 * 1000,
  });
}
