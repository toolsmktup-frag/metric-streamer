import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface MoveLeadParams {
  positionId: string;
  leadId: string;
  funnelId: string;
  fromStageId: string;
  toStageId: string;
  toStageName?: string;
}

export function useMoveLeadStage() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ positionId, leadId, funnelId, fromStageId, toStageId }: MoveLeadParams) => {
      // Update stage position
      const { error: updateError } = await (supabase as any)
        .from('lead_stage_positions')
        .update({ stage_id: toStageId, entered_at: new Date().toISOString() })
        .eq('id', positionId);
      if (updateError) throw updateError;

      // Insert stage_change event
      const { error: eventError } = await (supabase as any)
        .from('lead_events')
        .insert({
          lead_id: leadId,
          funnel_id: funnelId,
          event_name: 'stage_change',
          metadata: { from_stage_id: fromStageId, to_stage_id: toStageId },
        });
      if (eventError) throw eventError;
    },
    onSuccess: (_data, variables) => {
      const label = variables.toStageName ? ` para "${variables.toStageName}"` : '';
      toast.success(`Lead movido${label}`);
      queryClient.invalidateQueries({ queryKey: ['leads-by-funnel', variables.funnelId] });
      queryClient.invalidateQueries({ queryKey: ['funnel-lead-counts', variables.funnelId] });
      queryClient.invalidateQueries({ queryKey: ['lead-events'] });
    },
    onError: () => {
      toast.error('Erro ao mover lead');
    },
  });
}
