import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export function useAssignLead() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ leadId, assignedTo }: { leadId: string; assignedTo: string | null }) => {
      const { error } = await (supabase as any)
        .from('leads')
        .update({ assigned_to: assignedTo, updated_at: new Date().toISOString() })
        .eq('id', leadId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['leads-by-funnel'] });
      toast.success('Vendedor atribuído com sucesso');
    },
    onError: (err: any) => {
      toast.error(err.message || 'Erro ao atribuir vendedor');
    },
  });
}
