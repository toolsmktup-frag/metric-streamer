import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface GirassolConfig {
  id: number;
  system_prompt: string;
  draft_prompt: string | null;
  strike_limit: number;
  human_pause_minutes: number;
  pause_hours: number;
  active_version: number;
  published_at: string;
  published_by_name: string | null;
  updated_at: string;
  /** Instância do WhatsApp que o agente escuta e usa pra responder. */
  instance_id: string | null;
}

export interface GirassolVersion {
  id: string;
  version: number;
  system_prompt: string;
  note: string | null;
  created_at: string;
  created_by_name: string | null;
}

async function userStamp(): Promise<{ id: string | null; name: string }> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { id: null, name: 'usuário' };
  const { data: profile } = await (supabase as any)
    .from('user_profiles').select('full_name').eq('id', user.id).maybeSingle();
  return { id: user.id, name: profile?.full_name || user.email || 'usuário' };
}

/** Config viva do agente Girassol (o processo na VPS lê esta linha a cada ~1 min). */
export function useGirassolConfig() {
  return useQuery({
    queryKey: ['girassol-config'],
    queryFn: async (): Promise<GirassolConfig | null> => {
      const { data, error } = await (supabase as any)
        .from('girassol_config').select('*').eq('id', 1).maybeSingle();
      if (error) throw error;
      return data;
    },
    staleTime: 15 * 1000,
  });
}

export function useGirassolVersions() {
  return useQuery({
    queryKey: ['girassol-versions'],
    queryFn: async (): Promise<GirassolVersion[]> => {
      const { data, error } = await (supabase as any)
        .from('girassol_prompt_versions')
        .select('id, version, system_prompt, note, created_at, created_by_name')
        .order('version', { ascending: false });
      if (error) throw error;
      return data || [];
    },
    staleTime: 30 * 1000,
  });
}

/** Guarda o rascunho sem publicar (o agente continua com a versão publicada). */
export function useSaveGirassolDraft() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (draft: string) => {
      const { error } = await (supabase as any)
        .from('girassol_config')
        .update({ draft_prompt: draft, updated_at: new Date().toISOString() })
        .eq('id', 1);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['girassol-config'] });
      toast.success('Rascunho salvo — o agente segue com a versão publicada');
    },
    onError: (e: any) => toast.error(e?.message || 'Erro ao salvar rascunho'),
  });
}

interface PublishInput {
  prompt: string;
  strike_limit: number;
  human_pause_minutes: number;
  pause_hours: number;
  instance_id: string | null;
  note?: string;
}

/** Publica: grava versão nova no histórico e atualiza a linha ativa (vale em ~1 min). */
export function usePublishGirassol() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ prompt, strike_limit, human_pause_minutes, pause_hours, instance_id, note }: PublishInput) => {
      if (prompt.trim().length < 200) {
        throw new Error('Prompt curto demais — isso derrubaria o comportamento do agente. Confere o conteúdo.');
      }
      const who = await userStamp();
      const { data: cfg, error: cfgErr } = await (supabase as any)
        .from('girassol_config').select('active_version').eq('id', 1).single();
      if (cfgErr) throw cfgErr;
      const nextVersion = (cfg?.active_version || 0) + 1;

      const { error: verErr } = await (supabase as any)
        .from('girassol_prompt_versions')
        .insert({
          version: nextVersion,
          system_prompt: prompt,
          note: note?.trim() || null,
          created_by: who.id,
          created_by_name: who.name,
        });
      if (verErr) throw verErr;

      const { error: upErr } = await (supabase as any)
        .from('girassol_config')
        .update({
          system_prompt: prompt,
          draft_prompt: null,
          strike_limit,
          human_pause_minutes,
          pause_hours,
          instance_id,
          active_version: nextVersion,
          published_at: new Date().toISOString(),
          published_by: who.id,
          published_by_name: who.name,
          updated_at: new Date().toISOString(),
        })
        .eq('id', 1);
      if (upErr) throw upErr;
      return nextVersion;
    },
    onSuccess: (v) => {
      qc.invalidateQueries({ queryKey: ['girassol-config'] });
      qc.invalidateQueries({ queryKey: ['girassol-versions'] });
      toast.success(`Versão ${v} publicada — o Girassol aplica em até 1 minuto`);
    },
    onError: (e: any) => toast.error(e?.message || 'Erro ao publicar'),
  });
}
