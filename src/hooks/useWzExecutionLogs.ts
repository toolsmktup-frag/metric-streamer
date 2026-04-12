import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { WzExecutionLog } from '@/types/wz-automation';

export function useWzExecutionLogs(executionId: string | null) {
  return useQuery({
    queryKey: ['wz-execution-logs', executionId],
    enabled: !!executionId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('wz_execution_logs' as any)
        .select('*')
        .eq('execution_id', executionId!)
        .order('started_at', { ascending: true });

      if (error) throw error;
      return (data || []) as unknown as WzExecutionLog[];
    },
  });
}
