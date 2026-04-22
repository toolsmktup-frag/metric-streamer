import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface SalesScript {
  id: string;
  organization_id: string;
  name: string;
  content: string;
  is_default: boolean;
  created_at: string;
  updated_at: string;
}

export function useActiveSalesScript() {
  return useQuery({
    queryKey: ['sales-copilot-script', 'active'],
    queryFn: async (): Promise<SalesScript | null> => {
      const { data, error } = await (supabase as any)
        .from('sales_copilot_scripts')
        .select('*')
        .eq('is_default', true)
        .maybeSingle();
      if (error && error.code !== 'PGRST116') throw error;
      return data;
    },
    staleTime: 60 * 1000,
  });
}

export function useUpsertSalesScript() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, content, name }: { id?: string; content: string; name?: string }) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Não autenticado');

      const { data: profile } = await (supabase as any)
        .from('user_profiles')
        .select('organization_id')
        .eq('id', user.id)
        .maybeSingle();
      if (!profile?.organization_id) throw new Error('Organização não encontrada');

      if (id) {
        const { error } = await (supabase as any)
          .from('sales_copilot_scripts')
          .update({ content, ...(name ? { name } : {}) })
          .eq('id', id);
        if (error) throw error;
      } else {
        const { error } = await (supabase as any)
          .from('sales_copilot_scripts')
          .insert({
            organization_id: profile.organization_id,
            name: name || 'Script padrão',
            content,
            is_default: true,
            created_by: user.id,
          });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['sales-copilot-script'] });
      toast.success('Script salvo');
    },
    onError: (err: any) => {
      toast.error(err.message || 'Erro ao salvar script');
    },
  });
}
