import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface TeamMember {
  id: string;
  full_name: string | null;
  avatar_url: string | null;
  email: string;
  role: string;
  status: string;
  created_at: string;
  updated_at: string;
}

const ROLES = ['admin', 'gestor', 'vendedor', 'suporte'] as const;
export type UserRole = typeof ROLES[number];
export { ROLES };

export const ROLE_LABELS: Record<string, string> = {
  admin: 'Administrador',
  gestor: 'Gestor',
  vendedor: 'Vendedor',
  suporte: 'Suporte',
};

export const STATUS_LABELS: Record<string, string> = {
  pending: 'Pendente',
  active: 'Ativo',
  blocked: 'Bloqueado',
};

export function useTeamMembers() {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ['team-members'],
    queryFn: async (): Promise<TeamMember[]> => {
      const { data: orgId } = await (supabase as any).rpc('get_user_org_id');
      if (!orgId) throw new Error('Organização não encontrada');

      // Try with avatar_url first, fallback without it if column doesn't exist yet
      let result = await (supabase as any)
        .from('user_profiles')
        .select('id, full_name, avatar_url, role, status, created_at, updated_at')
        .eq('organization_id', orgId)
        .order('created_at', { ascending: true });

      if (result.error) {
        // Fallback: avatar_url column may not exist yet
        result = await (supabase as any)
          .from('user_profiles')
          .select('id, full_name, role, status, created_at, updated_at')
        .eq('organization_id', orgId)
        .order('created_at', { ascending: true });

      if (error) throw error;

      return (data || []).map((p: any) => ({
        ...p,
        email: '',
      }));
    },
  });

  const updateRole = useMutation({
    mutationFn: async ({ userId, role }: { userId: string; role: string }) => {
      const { error } = await (supabase as any)
        .from('user_profiles')
        .update({ role, updated_at: new Date().toISOString() })
        .eq('id', userId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['team-members'] });
      toast.success('Role atualizado com sucesso');
    },
    onError: (err: any) => {
      toast.error(err.message || 'Erro ao atualizar role');
    },
  });

  const updateName = useMutation({
    mutationFn: async ({ userId, fullName }: { userId: string; fullName: string }) => {
      const { error } = await (supabase as any)
        .from('user_profiles')
        .update({ full_name: fullName, updated_at: new Date().toISOString() })
        .eq('id', userId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['team-members'] });
      toast.success('Nome atualizado com sucesso');
    },
    onError: (err: any) => {
      toast.error(err.message || 'Erro ao atualizar nome');
    },
  });

  const updateStatus = useMutation({
    mutationFn: async ({ userId, status }: { userId: string; status: string }) => {
      const { error } = await (supabase as any)
        .from('user_profiles')
        .update({ status, updated_at: new Date().toISOString() })
        .eq('id', userId);
      if (error) throw error;
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['team-members'] });
      const label = variables.status === 'active' ? 'aprovado' : variables.status === 'blocked' ? 'bloqueado' : 'atualizado';
      toast.success(`Usuário ${label} com sucesso`);
    },
    onError: (err: any) => {
      toast.error(err.message || 'Erro ao atualizar status');
    },
  });

  return { ...query, updateRole, updateName, updateStatus };
}
