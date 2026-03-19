import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { Lead } from '@/types/leadFunnels';

/** Generate phone format variations for flexible matching */
function phoneVariations(phone: string): string[] {
  // Strip all non-digits
  const digits = phone.replace(/\D/g, '');
  const variations = new Set<string>();

  // Original as-is
  variations.add(phone);
  // Pure digits
  variations.add(digits);
  // With + prefix
  variations.add(`+${digits}`);

  // With/without country code 55
  if (digits.startsWith('55') && digits.length >= 12) {
    const withoutCC = digits.slice(2);
    variations.add(withoutCC);
    variations.add(`+${digits}`);
  } else if (digits.length >= 10 && digits.length <= 11) {
    // Probably a BR number without country code
    variations.add(`55${digits}`);
    variations.add(`+55${digits}`);
  }

  return [...variations];
}

export function useLeadByPhone(phone: string | null) {
  return useQuery({
    queryKey: ['lead-by-phone', phone],
    queryFn: async () => {
      if (!phone) return null;

      const variations = phoneVariations(phone);

      // Search leads table with all phone variations
      const { data, error } = await (supabase as any)
        .from('leads')
        .select('*')
        .in('phone', variations)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) throw error;
      if (data) return data as Lead;

      // Fallback: search by phone in metadata fields
      for (const variant of variations) {
        const { data: metaMatch } = await (supabase as any)
          .from('leads')
          .select('*')
          .or(`metadata->>phone.eq.${variant},metadata->>cel.eq.${variant},metadata->>telefone.eq.${variant}`)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (metaMatch) return metaMatch as Lead;
      }

      return null;
    },
    enabled: !!phone,
    staleTime: 5 * 60 * 1000,
  });
}
