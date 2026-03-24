import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { WzExecution } from '@/types/wz-automation';

export function useWzExecutions(filters?: {
  flowId?: string;
  status?: string;
  dateFrom?: string;
  dateTo?: string;
}) {
  return useQuery({
    queryKey: ['wz-executions', filters],
    queryFn: async () => {
      let query = supabase
        .from('wz_executions' as any)
        .select('*, wz_flows!inner(name)')
        .order('started_at', { ascending: false })
        .limit(200);

      if (filters?.flowId) query = query.eq('flow_id', filters.flowId);
      if (filters?.status) query = query.eq('status', filters.status);
      if (filters?.dateFrom) query = query.gte('started_at', filters.dateFrom);
      if (filters?.dateTo) query = query.lte('started_at', filters.dateTo);

      const { data, error } = await query;
      if (error) throw error;

      return ((data || []) as any[]).map((row: any) => ({
        ...row,
        flow_name: row.wz_flows?.name || 'Sem nome',
      })) as WzExecution[];
    },
  });
}
