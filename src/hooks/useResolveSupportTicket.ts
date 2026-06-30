import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { sendWhatsAppMessage } from '@/hooks/useWhatsApp';
import { toast } from 'sonner';

export interface ResolveTicketParams {
  positionId: string;
  leadId: string;
  funnelId: string;
  fromStageId: string;
  toStageId: string;
  toStageName?: string;
  phone?: string | null;
  reason: string;
  reasonLabel: string;
  note?: string;
  /** Reativar a Girassol pra esse contato (limpa metadata.bot_paused_until). */
  returnToBot: boolean;
  /** Mensagem de encerramento opcional pro cliente. */
  closingMessage?: string;
  resolvedBy?: string | null;
}

interface ResolveResult {
  messageSent: boolean;
  sendError?: string;
  returnedToBot: boolean;
}

/**
 * Acha a instância do WhatsApp que conversou com esse telefone (a mais recente) — é por
 * ela que a mensagem de encerramento precisa sair pra cair no mesmo fio da conversa.
 */
async function resolveInstanceForPhone(phone: string): Promise<string | null> {
  const last8 = phone.replace(/\D/g, '').slice(-8);
  if (last8.length < 7) return null;
  const { data } = await (supabase as any)
    .from('whatsapp_messages')
    .select('instance_id')
    .ilike('phone', `%${last8}`)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  return data?.instance_id ?? null;
}

/**
 * Finaliza um ticket do board "Suporte — Atendimento Humano": move o card pra etapa de
 * resolução, registra o motivo no histórico (evento `ticket_resolved`), opcionalmente
 * devolve o atendimento pra Girassol e dispara uma mensagem de encerramento pro cliente.
 *
 * Mover é o passo crítico (falha = erro). Devolver pra IA e enviar a mensagem são
 * best-effort: o ticket fecha mesmo que um deles falhe, e o resultado vai no toast.
 */
export function useResolveSupportTicket() {
  const queryClient = useQueryClient();

  return useMutation<ResolveResult, Error, ResolveTicketParams>({
    mutationFn: async (p) => {
      // 1) Move o card pra etapa de resolução (crítico)
      const { error: moveError } = await (supabase as any)
        .from('lead_stage_positions')
        .update({ stage_id: p.toStageId, entered_at: new Date().toISOString() })
        .eq('id', p.positionId);
      if (moveError) throw moveError;

      // 2) Devolve pra Girassol (best-effort)
      let returnedToBot = false;
      if (p.returnToBot) {
        const { error: pauseError } = await (supabase as any).rpc('set_lead_bot_pause', {
          p_lead_id: p.leadId,
          p_until: null,
        });
        returnedToBot = !pauseError;
        if (pauseError) console.error('[resolve-ticket] devolver pra IA falhou:', pauseError.message);
      }

      // 3) Mensagem de encerramento pro cliente (best-effort)
      let messageSent = false;
      let sendError: string | undefined;
      const closing = p.closingMessage?.trim();
      if (closing && p.phone) {
        try {
          const instanceId = await resolveInstanceForPhone(p.phone);
          if (!instanceId) throw new Error('não achei a conversa desse contato no WhatsApp');
          await sendWhatsAppMessage({ instance_id: instanceId, phone: p.phone, body: closing });
          messageSent = true;
        } catch (e) {
          sendError = e instanceof Error ? e.message : String(e);
          console.error('[resolve-ticket] envio da mensagem falhou:', sendError);
        }
      }

      // 4) Registra a resolução no histórico do lead
      const { error: eventError } = await (supabase as any)
        .from('lead_events')
        .insert({
          lead_id: p.leadId,
          funnel_id: p.funnelId,
          event_name: 'ticket_resolved',
          metadata: {
            reason: p.reason,
            reason_label: p.reasonLabel,
            note: p.note?.trim() || null,
            returned_to_bot: returnedToBot,
            closing_message: messageSent ? closing : null,
            from_stage_id: p.fromStageId,
            to_stage_id: p.toStageId,
            resolved_by: p.resolvedBy || null,
          },
        });
      if (eventError) throw eventError;

      return { messageSent, sendError, returnedToBot };
    },
    onSuccess: (result, variables) => {
      const parts = ['Ticket resolvido'];
      if (variables.returnToBot) parts.push(result.returnedToBot ? 'devolvido pra Girassol' : 'mas não consegui devolver pra IA');
      if (variables.closingMessage?.trim()) {
        parts.push(result.messageSent ? 'mensagem enviada' : `mensagem NÃO enviada (${result.sendError || 'erro'})`);
      }
      const failed = (variables.returnToBot && !result.returnedToBot) || (!!variables.closingMessage?.trim() && !result.messageSent);
      const msg = parts.join(' · ');
      if (failed) toast.warning(msg);
      else toast.success(msg);

      queryClient.invalidateQueries({ queryKey: ['leads-by-funnel', variables.funnelId] });
      queryClient.invalidateQueries({ queryKey: ['funnel-lead-counts', variables.funnelId] });
      queryClient.invalidateQueries({ queryKey: ['lead-events'] });
    },
    onError: () => {
      toast.error('Erro ao resolver o ticket');
    },
  });
}
