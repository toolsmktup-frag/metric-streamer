import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface WzGroupOption {
  id: string;
  name: string;
  participants_count?: number;
}

export interface WzGroupSyncConfig {
  id?: string;
  funnel_id: string;
  instance_id: string | null;
  group_ids: string[];
  in_group_stage_id: string | null;
  not_in_group_stage_id: string | null;
  invited_stage_id: string | null;
  left_group_stage_id: string | null;
  auto_move_on_join: boolean;
  auto_move_on_leave: boolean;
  is_active: boolean;
}

export interface WzGroupSyncResult {
  total_positions: number;
  matched_count: number;
  missing_count: number;
  invalid_phone_count: number;
  already_in_stage_count?: number;
  moved_in_count?: number;
  moved_out_count?: number;
  invited_count?: number;
  failed_invite_count?: number;
  samples?: {
    matched: Array<{ name: string | null; phone: string | null }>;
    missing: Array<{ name: string | null; phone: string | null }>;
    invalid: Array<{ name: string | null; phone: string | null }>;
  };
}

type InvokeBody = Partial<WzGroupSyncConfig> & {
  mode: 'list_groups' | 'get_config' | 'save_config' | 'preview' | 'apply' | 'invite_missing' | 'enable_webhook' | 'list_runs' | 'webhook_status';
  funnel_id: string;
  invite_group_id?: string | null;
};

export interface WzGroupSyncRun {
  id: string;
  mode: string;
  status: string;
  error_message: string | null;
  group_ids: string[];
  payload: any;
  created_at: string;
}

export interface WzWebhookStatus {
  registered: boolean;
  hasGroups: boolean;
  expectedUrl?: string;
  raw?: any;
  error?: string;
}

async function invokeGroupSync<T>(body: InvokeBody): Promise<T> {
  const { data, error } = await supabase.functions.invoke('wz-group-sync', { body });
  if (error) throw error;
  if (data?.error) throw new Error(data.error);
  return data as T;
}

export function useWzGroupSyncConfig(funnelId: string | null) {
  return useQuery({
    queryKey: ['wz-group-sync-config', funnelId],
    queryFn: async () => {
      if (!funnelId) return null;
      const result = await invokeGroupSync<{ config: WzGroupSyncConfig | null }>({ mode: 'get_config', funnel_id: funnelId });
      return result.config;
    },
    enabled: !!funnelId,
  });
}

export function useWzGroupList() {
  return useMutation({
    mutationFn: async ({ funnelId, instanceId }: { funnelId: string; instanceId: string }) => {
      const result = await invokeGroupSync<{ groups: WzGroupOption[] }>({ mode: 'list_groups', funnel_id: funnelId, instance_id: instanceId });
      return result.groups;
    },
  });
}

export function useSaveWzGroupSyncConfig() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (config: WzGroupSyncConfig) => {
      const result = await invokeGroupSync<{ config: WzGroupSyncConfig }>({ mode: 'save_config', ...config });
      return result.config;
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['wz-group-sync-config', vars.funnel_id] });
      toast.success('Configuração de grupos salva');
    },
  });
}

export function usePreviewWzGroupSync() {
  return useMutation({
    mutationFn: async (config: WzGroupSyncConfig) => {
      const result = await invokeGroupSync<{ result: WzGroupSyncResult }>({ mode: 'preview', ...config });
      return result.result;
    },
  });
}

export function useApplyWzGroupSync() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (config: WzGroupSyncConfig) => {
      const result = await invokeGroupSync<{ result: WzGroupSyncResult }>({ mode: 'apply', ...config });
      return result.result;
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['leads-by-funnel', vars.funnel_id] });
      qc.invalidateQueries({ queryKey: ['funnel-lead-counts', vars.funnel_id] });
      toast.success('Movimentação aplicada');
    },
  });
}

export function useInviteMissingWzGroupSync() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (config: WzGroupSyncConfig & { invite_group_id?: string | null }) => {
      const result = await invokeGroupSync<{ result: WzGroupSyncResult }>({ mode: 'invite_missing', ...config });
      return result.result;
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['leads-by-funnel', vars.funnel_id] });
      qc.invalidateQueries({ queryKey: ['funnel-lead-counts', vars.funnel_id] });
      toast.success('Convites processados');
    },
  });
}

export function useEnableWzGroupWebhook() {
  return useMutation({
    mutationFn: async (config: WzGroupSyncConfig) => {
      await invokeGroupSync<{ ok: boolean }>({ mode: 'enable_webhook', ...config });
    },
    onSuccess: () => toast.success('Monitoramento de grupos ativado'),
  });
}
