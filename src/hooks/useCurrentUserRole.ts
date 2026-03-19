import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export function useCurrentUserRole() {
  return useQuery({
    queryKey: ['current-user-role'],
    queryFn: async (): Promise<string> => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return 'vendedor';

      const { data } = await (supabase as any)
        .from('user_profiles')
        .select('role')
        .eq('id', user.id)
        .maybeSingle();

      return data?.role || 'vendedor';
    },
    staleTime: 5 * 60 * 1000,
  });
}
