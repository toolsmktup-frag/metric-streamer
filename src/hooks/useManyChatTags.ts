import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface ManyChatTag {
  id: number;
  name: string;
}

/** Lista as tags da conta ManyChat (para o dropdown do nó "ManyChat" nos flows). */
export function useManyChatTags() {
  return useQuery({
    queryKey: ['manychat-tags'],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke('manychat-tags', { body: {} });
      if (error) throw error;
      return ((data?.tags as ManyChatTag[]) || []).sort((a, b) =>
        a.name.localeCompare(b.name)
      );
    },
    staleTime: 5 * 60 * 1000,
  });
}
