import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import type { KanbanFilters } from '@/lib/kanbanFilters';

export interface KanbanSavedView {
  id: string;
  funnel_id: string;
  organization_id: string;
  name: string;
  filters: KanbanFilters;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export function useKanbanSavedViews(funnelId: string | null) {
  return useQuery({
    queryKey: ['kanban-saved-views', funnelId],
    queryFn: async (): Promise<KanbanSavedView[]> => {
      if (!funnelId) return [];
      const { data, error } = await (supabase as any)
        .from('kanban_saved_views')
        .select('*')
        .eq('funnel_id', funnelId)
        .order('name');
      if (error) {
        console.warn('[useKanbanSavedViews] error:', error.message);
        return [];
      }
      return (data || []) as KanbanSavedView[];
    },
    enabled: !!funnelId,
    staleTime: 60_000,
  });
}

export function useSaveKanbanView() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      id?: string;
      funnel_id: string;
      name: string;
      filters: KanbanFilters;
    }) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Você precisa estar logado');

      if (input.id) {
        const { error } = await (supabase as any)
          .from('kanban_saved_views')
          .update({ name: input.name, filters: input.filters })
          .eq('id', input.id);
        if (error) throw error;
        return input.id;
      }

      const { data: orgId } = await (supabase as any).rpc('get_user_org_id');
      if (!orgId) throw new Error('Organização não encontrada');

      const { data, error } = await (supabase as any)
        .from('kanban_saved_views')
        .insert({
          funnel_id: input.funnel_id,
          organization_id: orgId,
          name: input.name,
          filters: input.filters,
          created_by: user.id,
        })
        .select('id')
        .single();
      if (error) throw error;
      return data.id as string;
    },
    onSuccess: (_id, vars) => {
      qc.invalidateQueries({ queryKey: ['kanban-saved-views', vars.funnel_id] });
      toast.success('Visão salva');
    },
    onError: (err: any) => toast.error(err.message || 'Erro ao salvar visão'),
  });
}

export function useDeleteKanbanView(funnelId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any)
        .from('kanban_saved_views')
        .delete()
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['kanban-saved-views', funnelId] });
      toast.success('Visão removida');
    },
    onError: (err: any) => toast.error(err.message || 'Erro ao remover visão'),
  });
}
