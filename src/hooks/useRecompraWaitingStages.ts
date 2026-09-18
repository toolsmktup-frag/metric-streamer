import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Etapas que as campanhas de recompra usam para guardar quem já recebeu
 * mensagem e aguarda resposta. Mover um card para lá na mão atrapalha a
 * automação, então a interface confirma antes.
 */
export function useRecompraWaitingStages() {
  return useQuery({
    queryKey: ['recompra-waiting-stages'],
    queryFn: async (): Promise<string[]> => {
      const { data, error } = await (supabase as unknown as SupabaseClient)
        .from('recompra_campaigns')
        .select('waiting_stage_id');
      if (error) {
        // a confirmação é uma proteção extra: se a consulta falhar, o app segue
        console.warn('[useRecompraWaitingStages]', error.message);
        return [];
      }
      return ((data || []) as { waiting_stage_id: string | null }[])
        .map((r) => r.waiting_stage_id)
        .filter((id): id is string => !!id);
    },
    staleTime: 10 * 60 * 1000,
  });
}
