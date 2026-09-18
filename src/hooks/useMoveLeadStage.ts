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
  /** de onde partiu o movimento; entra no metadata do evento, para métricas */
  via?: string;
}

export function useMoveLeadStage() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ positionId, leadId, funnelId, fromStageId, toStageId, via }: MoveLeadParams) => {
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
          // sem `triggered_by`: é movimento humano, e é isso que faz o
          // trg_protect_human_stage_moves blindar a etapa por 7 dias contra
          // webhook e cron. Não adicionar triggered_by aqui.
          metadata: { from_stage_id: fromStageId, to_stage_id: toStageId, ...(via ? { via } : {}) },
        });
      if (eventError) throw eventError;
    },
    onSuccess: (_data, variables) => {
      const label = variables.toStageName ? ` para "${variables.toStageName}"` : '';
      toast.success(`Lead movido${label}`);
      queryClient.invalidateQueries({ queryKey: ['leads-by-funnel', variables.funnelId] });
      queryClient.invalidateQueries({ queryKey: ['funnel-lead-counts', variables.funnelId] });
      queryClient.invalidateQueries({ queryKey: ['lead-events'] });
      queryClient.invalidateQueries({ queryKey: ['lead-funnel-journey'] });
      queryClient.invalidateQueries({ queryKey: ['leads-by-funnel'] });
    },
    onError: () => {
      toast.error('Erro ao mover lead');
    },
  });
}
