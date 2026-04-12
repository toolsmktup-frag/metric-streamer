import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface WzExecutionStats {
  totalToday: number;
  totalWeek: number;
  completedToday: number;
  failedToday: number;
  avgDurationMs: number;
  pendingSteps: number;
}

export function useWzExecutionStats() {
  return useQuery({
    queryKey: ['wz-execution-stats'],
    refetchInterval: 30_000,
    queryFn: async () => {
      const now = new Date();
      const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
      const weekStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 7).toISOString();

      // Today's executions
      const { data: todayData } = await supabase
        .from('wz_executions' as any)
        .select('id, status, started_at, finished_at')
        .gte('started_at', todayStart);

      const todayExecs = (todayData || []) as any[];

      // Week's executions
      const { data: weekData } = await supabase
        .from('wz_executions' as any)
        .select('id')
        .gte('started_at', weekStart);

      // Pending steps
      const { data: pendingData } = await supabase
        .from('wz_scheduled_steps' as any)
        .select('id')
        .eq('status', 'pending');

      // Calculate avg duration from today's completed
      const completedToday = todayExecs.filter((e: any) => e.status === 'completed');
      const failedToday = todayExecs.filter((e: any) => e.status === 'failed');

      let avgDurationMs = 0;
      const withDuration = completedToday.filter((e: any) => e.finished_at);
      if (withDuration.length > 0) {
        const totalMs = withDuration.reduce((sum: number, e: any) => {
          return sum + (new Date(e.finished_at).getTime() - new Date(e.started_at).getTime());
        }, 0);
        avgDurationMs = totalMs / withDuration.length;
      }

      return {
        totalToday: todayExecs.length,
        totalWeek: (weekData || []).length,
        completedToday: completedToday.length,
        failedToday: failedToday.length,
        avgDurationMs,
        pendingSteps: (pendingData || []).length,
      } as WzExecutionStats;
    },
  });
}
