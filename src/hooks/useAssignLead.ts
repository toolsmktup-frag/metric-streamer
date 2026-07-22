import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export function useAssignLead() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ leadId, assignedTo }: { leadId: string; assignedTo: string | null }) => {
      const { error } = await (supabase as any).rpc('assign_lead_to_seller', {
        p_lead_id: leadId,
        p_assigned_to: assignedTo,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['leads-by-funnel'] });
      queryClient.invalidateQueries({ queryKey: ['all-leads'] });
      // Destrava a caixa do chat na hora após "Assumir": o read-only do
      // ChatInput/ContactPanel depende de lead.assigned_to desta query.
      queryClient.invalidateQueries({ queryKey: ['lead-by-phone'] });
      toast.success('Vendedor atribuído com sucesso');
    },
    onError: (err: any) => {
      toast.error(err.message || 'Erro ao atribuir vendedor');
    },
  });
}
