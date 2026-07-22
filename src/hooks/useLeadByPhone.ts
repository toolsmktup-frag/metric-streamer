import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { Lead } from '@/types/leadFunnels';

export function useLeadByPhone(phone: string | null) {
  return useQuery({
    queryKey: ['lead-by-phone', phone],
    queryFn: async () => {
      if (!phone) return null;

      // Busca canônica no servidor: casa o lead independente do formato gravado
      // (formatado "+55 (21) 99675-1303", DDI espúrio "+1 55...", 9º dígito) e
      // já prefere o lead "rico" quando há duplicados. Ver migration
      // 20260722180000_find_lead_by_phone.
      // cast: RPC nova ainda não está nos tipos gerados do Supabase
      const { data, error } = await (supabase.rpc as any)('find_lead_by_phone', { p_phone: phone });
      if (error) throw error;
      const lead = Array.isArray(data) ? data[0] : data;
      return (lead as Lead) ?? null;
    },
    enabled: !!phone,
    staleTime: 5 * 60 * 1000,
  });
}
