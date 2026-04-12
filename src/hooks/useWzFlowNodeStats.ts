import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface WzNodeStats {
  total: number;
  success: number;
  failed: number;
  pending: number; // for timer/delay nodes (pending scheduled steps)
}

export type WzFlowNodeStatsMap = Record<string, WzNodeStats>;

export function useWzFlowNodeStats(flowId: string | null | undefined) {
  return useQuery({
    queryKey: ['wz-flow-node-stats', flowId],
    enabled: !!flowId,
    refetchInterval: 30_000,
    queryFn: async () => {
      // 1. Get all execution IDs for this flow
      const { data: executions, error: execError } = await supabase
        .from('wz_executions' as any)
        .select('id')
        .eq('flow_id', flowId!);

      if (execError) throw execError;
      const execIds = ((executions || []) as any[]).map((e: any) => e.id);
      if (execIds.length === 0) return {} as WzFlowNodeStatsMap;

      // 2. Get all logs for those executions
      const { data: logs, error: logError } = await supabase
        .from('wz_execution_logs' as any)
        .select('node_id, status')
        .in('execution_id', execIds);

      if (logError) throw logError;

      // 3. Get pending scheduled steps
      const { data: pendingSteps, error: pendingError } = await supabase
        .from('wz_scheduled_steps' as any)
        .select('node_id')
        .in('execution_id', execIds)
        .eq('status', 'pending');

      if (pendingError) throw pendingError;

      // 4. Aggregate by node_id
      const statsMap: WzFlowNodeStatsMap = {};

      for (const log of (logs || []) as any[]) {
        const nodeId = log.node_id as string;
        if (!statsMap[nodeId]) {
          statsMap[nodeId] = { total: 0, success: 0, failed: 0, pending: 0 };
        }
        statsMap[nodeId].total++;
        if (log.status === 'success') statsMap[nodeId].success++;
        if (log.status === 'failed') statsMap[nodeId].failed++;
      }

      // Add pending counts
      for (const step of (pendingSteps || []) as any[]) {
        const nodeId = step.node_id as string;
        if (!statsMap[nodeId]) {
          statsMap[nodeId] = { total: 0, success: 0, failed: 0, pending: 0 };
        }
        statsMap[nodeId].pending++;
      }

      return statsMap;
    },
  });
}
