import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

const last8 = (p?: string | null) => (p || '').replace(/\D/g, '').slice(-8);

/**
 * Conjunto de telefones (últimos 8 dígitos) com atendimento HUMANO ativo —
 * i.e. leads cujo metadata.bot_paused_until está no futuro (a Girassol está pausada).
 * Consulta barata: só retorna os que estão pausados agora (poucos).
 * Usado pra marcar IA↔humano na lista de conversas.
 */
export function useBotPausedPhones() {
  return useQuery({
    queryKey: ['bot-paused-phones'],
    queryFn: async (): Promise<Set<string>> => {
      const nowIso = new Date().toISOString();
      const { data, error } = await (supabase as any)
        .from('leads')
        .select('phone, metadata')
        .filter('metadata->>bot_paused_until', 'gt', nowIso)
        .limit(1000);
      if (error) {
        console.warn('[useBotPausedPhones]', error.message);
        return new Set<string>();
      }
      const set = new Set<string>();
      for (const r of data || []) {
        const l = last8(r.phone);
        if (l) set.add(l);
      }
      return set;
    },
    staleTime: 10_000,
    refetchInterval: 20_000,
  });
}

export const phoneLast8 = last8;
