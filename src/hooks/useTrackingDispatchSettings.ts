import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface TrackingDispatchSettings {
  id: number;
  enabled: boolean;
  channel: 'uazapi' | 'manychat';
  uazapi_phone: string | null;
  templates: string[];
  batch_size: number;
  send_delay_ms: number;
  mc_tag_name: string | null;
  mc_code_field: string;
  /** >0 = 1 mensagem a cada N minutos (aquecimento); 0 = modo lote */
  send_gap_minutes: number;
  queue_order: 'oldest_first' | 'newest_first';
  /** janela BRT [start, end); start === end desativa */
  send_window_start: number;
  send_window_end: number;
  updated_at: string;
  updated_by: string | null;
}

/** Config do disparo automático de rastreio (painel "Disparo" em /rastreios). */
export function useTrackingDispatchSettings() {
  return useQuery({
    queryKey: ['tracking-dispatch-settings'],
    queryFn: async (): Promise<TrackingDispatchSettings | null> => {
      const { data, error } = await (supabase as any)
        .from('tracking_dispatch_settings')
        .select('*')
        .eq('id', 1)
        .maybeSingle();
      if (error) throw error;
      if (!data) return null;
      return { ...data, templates: Array.isArray(data.templates) ? data.templates : [] };
    },
    staleTime: 30 * 1000,
  });
}

export function useUpdateTrackingDispatchSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (patch: Partial<TrackingDispatchSettings>) => {
      const { data: { user } } = await supabase.auth.getUser();
      const { error } = await (supabase as any)
        .from('tracking_dispatch_settings')
        .update({ ...patch, updated_at: new Date().toISOString(), updated_by: user?.id || null })
        .eq('id', 1);
      if (error) throw error;
    },
    onSuccess: (_d, patch) => {
      qc.invalidateQueries({ queryKey: ['tracking-dispatch-settings'] });
      if (typeof patch.enabled === 'boolean') {
        toast.success(patch.enabled ? 'Disparo automático LIGADO' : 'Disparo automático desligado');
      } else {
        toast.success('Configuração de disparo salva');
      }
    },
    onError: (e: any) => toast.error(e?.message || 'Erro ao salvar configuração'),
  });
}

/** Envia 1 mensagem de teste pelo canal configurado, sem tocar na fila. */
export function useSendDispatchTest() {
  return useMutation({
    mutationFn: async ({ phone, code }: { phone: string; code?: string }) => {
      const digits = phone.replace(/\D/g, '');
      if (digits.length < 10) throw new Error('Informe o telefone com DDD');
      const { data, error } = await supabase.functions.invoke('enqueue-tracking-dispatch', {
        body: { test: { phone: digits, code: code?.trim() || undefined } },
      });
      if (error) throw error;
      if (data?.skip) throw new Error(`Canal não está pronto: ${JSON.stringify(data?.detail || '')}`);
      if (!data?.ok) throw new Error(`Falhou: ${JSON.stringify(data?.detail || data || '')}`);
      return data;
    },
    onSuccess: () => toast.success('Mensagem de teste enviada — confere no WhatsApp'),
    onError: (e: any) => toast.error(e?.message || 'Erro no teste de envio'),
  });
}
