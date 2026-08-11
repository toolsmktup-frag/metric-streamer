import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase as _supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

// A tabela é nova e ainda não está nos tipos gerados do Supabase.
const supabase = _supabase as any;

export interface ScheduledMessage {
  id: string;
  organization_id: string;
  instance_id: string;
  phone: string;
  lead_id: string | null;
  contact_name: string | null;
  message_type: 'text' | 'audio';
  body: string | null;
  media_url: string | null;
  media_mime_type: string | null;
  audio_duration_seconds: number | null;
  scheduled_for: string;
  status: 'scheduled' | 'sent' | 'failed' | 'canceled';
  attempts: number;
  last_error: string | null;
  sent_at: string | null;
  created_by: string;
  created_at: string;
}

const KEY = 'scheduled-messages';

/**
 * Programadas de UMA conversa (painel lateral do chat).
 * Sem instanceId/phone o hook fica inerte — não dispara query.
 */
export function useScheduledMessagesForChat(instanceId?: string, phone?: string) {
  return useQuery({
    queryKey: [KEY, 'chat', instanceId ?? '', phone ?? ''],
    queryFn: async (): Promise<ScheduledMessage[]> => {
      const { data, error } = await supabase
        .from('scheduled_messages')
        .select('*')
        .eq('instance_id', instanceId)
        .eq('phone', phone)
        .order('scheduled_for', { ascending: true });
      if (error) throw error;
      return (data || []) as ScheduledMessage[];
    },
    enabled: !!instanceId && !!phone,
    staleTime: 30 * 1000,
  });
}

/** Todas as programadas visíveis para a usuária (lista geral). */
export function useAllScheduledMessages(status?: ScheduledMessage['status']) {
  return useQuery({
    queryKey: [KEY, 'all', status ?? 'todas'],
    queryFn: async (): Promise<ScheduledMessage[]> => {
      let q = supabase
        .from('scheduled_messages')
        .select('*')
        .order('scheduled_for', { ascending: true })
        .limit(500);
      if (status) q = q.eq('status', status);
      const { data, error } = await q;
      if (error) throw error;
      return (data || []) as ScheduledMessage[];
    },
    staleTime: 30 * 1000,
  });
}

export interface CreateScheduledMessageInput {
  instance_id: string;
  phone: string;
  lead_id?: string | null;
  contact_name?: string | null;
  message_type: 'text' | 'audio';
  body?: string | null;
  media_url?: string | null;
  media_mime_type?: string | null;
  audio_duration_seconds?: number | null;
  /** Instante do envio (objeto Date no fuso do navegador). */
  scheduled_for: Date;
}

export function useCreateScheduledMessage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateScheduledMessageInput) => {
      const [{ data: userData }, { data: orgId, error: orgErr }] = await Promise.all([
        supabase.auth.getUser(),
        supabase.rpc('get_user_org_id'),
      ]);
      if (orgErr) throw orgErr;
      const userId = userData?.user?.id;
      if (!userId) throw new Error('Sessão expirada — entre novamente.');
      if (!orgId) throw new Error('Organização não encontrada.');

      // Telefone na mesma forma canônica usada pelo envio, para a lista da
      // conversa casar com o que o chat mostra.
      const { data: canonical } = await supabase.rpc('br_canonical_phone', { p_phone: input.phone });
      const phone = (typeof canonical === 'string' && canonical) || input.phone;

      const { data, error } = await supabase
        .from('scheduled_messages')
        .insert({
          organization_id: orgId,
          instance_id: input.instance_id,
          phone,
          lead_id: input.lead_id ?? null,
          contact_name: input.contact_name ?? null,
          message_type: input.message_type,
          body: input.body ?? null,
          media_url: input.media_url ?? null,
          media_mime_type: input.media_mime_type ?? null,
          audio_duration_seconds: input.audio_duration_seconds ?? null,
          scheduled_for: input.scheduled_for.toISOString(),
          created_by: userId,
        })
        .select()
        .single();
      if (error) throw error;
      return data as ScheduledMessage;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [KEY] });
    },
    onError: (err: any) => {
      toast.error(err?.message || 'Não foi possível programar a mensagem');
    },
  });
}

export function useCancelScheduledMessage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { data: userData } = await supabase.auth.getUser();
      const { error } = await supabase
        .from('scheduled_messages')
        .update({
          status: 'canceled',
          canceled_by: userData?.user?.id ?? null,
          canceled_at: new Date().toISOString(),
        })
        .eq('id', id)
        .eq('status', 'scheduled');
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [KEY] });
      toast.success('Programação cancelada');
    },
    onError: (err: any) => {
      toast.error(err?.message || 'Não foi possível cancelar');
    },
  });
}
