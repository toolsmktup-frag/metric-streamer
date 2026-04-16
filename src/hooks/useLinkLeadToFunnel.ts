import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface LinkParams {
  leadId: string;
  funnelId: string;
  stageId: string;
  funnelName?: string;
}

/**
 * Vincula um lead a um funil em uma etapa específica.
 * Cria uma nova entrada em lead_stage_positions e registra o evento.
 * Idempotente via UNIQUE(lead_id, funnel_id) — se já existir, atualiza a etapa.
 */
export function useLinkLeadToFunnel() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ leadId, funnelId, stageId }: LinkParams) => {
      // Try insert; on conflict update
      const { data: existing } = await (supabase as any)
        .from('lead_stage_positions')
        .select('id, stage_id')
        .eq('lead_id', leadId)
        .eq('funnel_id', funnelId)
        .maybeSingle();

      if (existing) {
        const { error } = await (supabase as any)
          .from('lead_stage_positions')
          .update({ stage_id: stageId, entered_at: new Date().toISOString() })
          .eq('id', existing.id);
        if (error) throw error;
      } else {
        const { error } = await (supabase as any)
          .from('lead_stage_positions')
          .insert({
            lead_id: leadId,
            funnel_id: funnelId,
            stage_id: stageId,
            entered_at: new Date().toISOString(),
          });
        if (error) throw error;
      }

      await (supabase as any)
        .from('lead_events')
        .insert({
          lead_id: leadId,
          funnel_id: funnelId,
          event_name: 'funnel_change',
          metadata: {
            to_funnel_id: funnelId,
            to_stage_id: stageId,
            moved_by: 'manual',
            source: 'contact_panel_link',
          },
        });
    },
    onSuccess: (_data, vars) => {
      const label = vars.funnelName ? ` "${vars.funnelName}"` : '';
      toast.success(`Lead vinculado ao funil${label}`);
      queryClient.invalidateQueries({ queryKey: ['lead-funnel-journey'] });
      queryClient.invalidateQueries({ queryKey: ['leads-by-funnel', vars.funnelId] });
      queryClient.invalidateQueries({ queryKey: ['funnel-lead-counts', vars.funnelId] });
      queryClient.invalidateQueries({ queryKey: ['lead-events'] });
      queryClient.invalidateQueries({ queryKey: ['lead-funnel-stages'] });
    },
    onError: (err: any) => {
      console.error('[useLinkLeadToFunnel]', err);
      toast.error(err?.message || 'Erro ao vincular lead ao funil');
    },
  });
}
