import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface MoveLeadFunnelParams {
  positionId: string;
  leadId: string;
  fromFunnelId: string;
  toFunnelId: string;
  toFunnelName?: string;
}

export function useMoveLeadFunnel() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ positionId, leadId, fromFunnelId, toFunnelId }: MoveLeadFunnelParams) => {
      // Get the first stage of the target funnel
      const { data: firstStage, error: stageError } = await (supabase as any)
        .from('lead_funnel_stages')
        .select('id')
        .eq('funnel_id', toFunnelId)
        .order('sort_order', { ascending: true })
        .limit(1)
        .single();

      if (stageError || !firstStage) throw new Error('Funil destino não possui etapas');

      // Update position to new funnel + first stage
      const { error: updateError } = await (supabase as any)
        .from('lead_stage_positions')
        .update({
          funnel_id: toFunnelId,
          stage_id: firstStage.id,
          entered_at: new Date().toISOString(),
        })
        .eq('id', positionId);

      if (updateError) throw updateError;

      // Register funnel_change event
      const { error: eventError } = await (supabase as any)
        .from('lead_events')
        .insert({
          lead_id: leadId,
          funnel_id: toFunnelId,
          event_name: 'funnel_change',
          metadata: {
            from_funnel_id: fromFunnelId,
            to_funnel_id: toFunnelId,
            moved_by: 'manual',
          },
        });

      if (eventError) throw eventError;
    },
    onSuccess: (_data, variables) => {
      const label = variables.toFunnelName ? ` para "${variables.toFunnelName}"` : '';
      toast.success(`Funil alterado${label}`);
      queryClient.invalidateQueries({ queryKey: ['lead-funnel-journey'] });
      queryClient.invalidateQueries({ queryKey: ['leads-by-funnel'] });
      queryClient.invalidateQueries({ queryKey: ['funnel-lead-counts'] });
      queryClient.invalidateQueries({ queryKey: ['lead-events'] });
      queryClient.invalidateQueries({ queryKey: ['lead-funnel-stages'] });
    },
    onError: () => {
      toast.error('Erro ao alterar funil');
    },
  });
}
