import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface GuruAccount {
  api_token: string;
  account_slug: string;
  display_name: string;
  color: string;
}

/**
 * Cadastro das contas Guru (Soulnaturi, Articulabem, etc.).
 * Usado para exibir badges coloridos e filtros por marca.
 */
export function useGuruAccounts() {
  return useQuery({
    queryKey: ['guru-accounts'],
    queryFn: async (): Promise<GuruAccount[]> => {
      const { data, error } = await (supabase as any)
        .from('guru_accounts')
        .select('api_token, account_slug, display_name, color')
        .order('display_name');
      if (error) {
        // Tabela ainda não existe (migration não rodou) → degrada silenciosamente
        console.warn('[useGuruAccounts]', error.message);
        return [];
      }
      return (data || []) as GuruAccount[];
    },
    staleTime: 10 * 60 * 1000,
  });
}
