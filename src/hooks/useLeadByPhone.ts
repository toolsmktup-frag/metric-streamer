import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { Lead } from '@/types/leadFunnels';

export function useLeadByPhone(phone: string | null) {
  return useQuery({
    queryKey: ['lead-by-phone', phone],
    queryFn: async () => {
      if (!phone) return null;

      // Try exact match first
      const { data, error } = await (supabase as any)
        .from('leads')
        .select('*')
        .eq('phone', phone)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) throw error;
      if (data) return data as Lead;

      // Try without country code prefix (55)
      if (phone.startsWith('55') && phone.length >= 12) {
        const withoutCC = phone.slice(2);
        const { data: d2 } = await (supabase as any)
          .from('leads')
          .select('*')
          .eq('phone', withoutCC)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        if (d2) return d2 as Lead;
      }

      return null;
    },
    enabled: !!phone,
    staleTime: 5 * 60 * 1000,
  });
}
