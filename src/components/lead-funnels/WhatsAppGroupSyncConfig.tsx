import React, { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { CheckCircle2, Loader2, RefreshCw, Send, Users, Webhook, Save, AlertCircle, Activity } from 'lucide-react';
import { useWzInstances } from '@/hooks/useWzInstances';
import {
  useApplyWzGroupSync,
  useEnableWzGroupWebhook,
  useInviteMissingWzGroupSync,
  usePreviewWzGroupSync,
  useSaveWzGroupSyncConfig,
  useWzGroupList,
  useWzGroupSyncConfig,
  useWzGroupSyncRuns,
  useWzWebhookStatus,
  type WzGroupOption,
  type WzGroupSyncConfig,
  type WzGroupSyncResult,
} from '@/hooks/useWzGroupSync';
import type { LeadFunnelStage } from '@/types/leadFunnels';
import { toast } from 'sonner';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface WhatsAppGroupSyncConfigProps {
  funnelId: string;
  stages: LeadFunnelStage[];
}

const NONE_VALUE = '__none__';

const emptyConfig = (funnelId: string): WzGroupSyncConfig => ({
  funnel_id: funnelId,
  instance_id: null,
  group_ids: [],
  in_group_stage_id: null,
  not_in_group_stage_id: null,
  invited_stage_id: null,
  left_group_stage_id: null,
  auto_move_on_join: true,
  auto_move_on_leave: false,
  is_active: true,
});

const stageName = (stages: LeadFunnelStage[], id?: string | null) => stages.find(stage => stage.id === id)?.name || 'etapa escolhida';

const Metric = ({ label, value }: { label: string; value: number | undefined }) => (
  <div className="rounded-md border border-border bg-muted/30 p-3">
    <div className="text-xl font-semibold text-foreground">{value ?? 0}</div>
    <div className="text-xs text-muted-foreground">{label}</div>
  </div>
);

const StageSelect = ({ value, onChange, stages, placeholder, allowNone = true }: { value: string | null; onChange: (value: string | null) => void; stages: LeadFunnelStage[]; placeholder: string; allowNone?: boolean }) => (
  <Select value={value || NONE_VALUE} onValueChange={next => onChange(next === NONE_VALUE ? null : next)}>
    <SelectTrigger>
      <SelectValue placeholder={placeholder} />
    </SelectTrigger>
    <SelectContent>
      {allowNone && <SelectItem value={NONE_VALUE}>Não mover</SelectItem>}
      {stages.map(stage => (
        <SelectItem key={stage.id} value={stage.id}>{stage.name}</SelectItem>
      ))}
    </SelectContent>
  </Select>
);

const ResultPanel = ({ result, stages, config }: { result: WzGroupSyncResult; stages: LeadFunnelStage[]; config: WzGroupSyncConfig }) => (
  <div className="space-y-3 rounded-md border border-border bg-muted/20 p-4">
    <div className="flex flex-wrap items-center gap-2">
      <Badge variant="secondary">Prévia</Badge>
      <span className="text-sm text-muted-foreground">
        Encontrados vão para {stageName(stages, config.in_group_stage_id)}
        {config.not_in_group_stage_id ? `; ausentes vão para ${stageName(stages, config.not_in_group_stage_id)}` : ''}.
      </span>
    </div>
    <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
      <Metric label="No Kanban" value={result.total_positions} />
      <Metric label="No grupo" value={result.matched_count} />
      <Metric label="Fora do grupo" value={result.missing_count} />
      <Metric label="Telefone inválido" value={result.invalid_phone_count} />
    </div>
    <div className="grid gap-3 md:grid-cols-2">
      <div>
        <div className="mb-1 text-xs font-medium text-foreground">Amostra encontrados</div>
        <div className="space-y-1 text-xs text-muted-foreground">
          {(result.samples?.matched || []).map((lead, index) => <div key={index}>{lead.name || 'Sem nome'} · {lead.phone || 'sem telefone'}</div>)}
          {(result.samples?.matched || []).length === 0 && <div>Nenhum encontrado.</div>}
        </div>
      </div>
      <div>
        <div className="mb-1 text-xs font-medium text-foreground">Amostra ausentes</div>
        <div className="space-y-1 text-xs text-muted-foreground">
          {(result.samples?.missing || []).map((lead, index) => <div key={index}>{lead.name || 'Sem nome'} · {lead.phone || 'sem telefone'}</div>)}
          {(result.samples?.missing || []).length === 0 && <div>Nenhum ausente.</div>}
        </div>
      </div>
    </div>
  </div>
);

const WhatsAppGroupSyncConfig: React.FC<WhatsAppGroupSyncConfigProps> = ({ funnelId, stages }) => {
  const { data: instances = [] } = useWzInstances();
  const { data: savedConfig } = useWzGroupSyncConfig(funnelId);
  const listGroups = useWzGroupList();
  const saveConfig = useSaveWzGroupSyncConfig();
  const previewSync = usePreviewWzGroupSync();
  const applySync = useApplyWzGroupSync();
  const inviteMissing = useInviteMissingWzGroupSync();
  const enableWebhook = useEnableWzGroupWebhook();

  const [config, setConfig] = useState<WzGroupSyncConfig>(() => emptyConfig(funnelId));
  const [groups, setGroups] = useState<WzGroupOption[]>([]);
  const [inviteGroupId, setInviteGroupId] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<WzGroupSyncResult | null>(null);

  const { data: webhookStatus } = useWzWebhookStatus(funnelId, config.instance_id);
  const { data: runs = [] } = useWzGroupSyncRuns(funnelId);
  const webhookEvents = useMemo(() => runs.filter(r => r.mode === 'webhook_event').slice(0, 5), [runs]);

  useEffect(() => {
    if (savedConfig) {
      setConfig({ ...emptyConfig(funnelId), ...savedConfig, group_ids: savedConfig.group_ids || [] });
      setInviteGroupId(savedConfig.group_ids?.[0] || null);
    }
  }, [savedConfig, funnelId]);

  const selectedGroups = useMemo(() => new Set(config.group_ids), [config.group_ids]);
  const canRun = !!config.instance_id && config.group_ids.length > 0 && !!config.in_group_stage_id;
  const automationOn = config.auto_move_on_join || config.auto_move_on_leave;

  const update = <K extends keyof WzGroupSyncConfig>(key: K, value: WzGroupSyncConfig[K]) => {
    setConfig(prev => ({ ...prev, [key]: value }));
  };

  const handleLoadGroups = async () => {
    if (!config.instance_id) {
      toast.error('Escolha uma instância primeiro');
      return;
    }
    const loaded = await listGroups.mutateAsync({ funnelId, instanceId: config.instance_id });
    setGroups(loaded);
    toast.success(`${loaded.length} grupo(s) carregado(s)`);
  };

  const handleToggleGroup = (groupId: string, checked: boolean) => {
    const next = checked ? [...config.group_ids, groupId] : config.group_ids.filter(id => id !== groupId);
    update('group_ids', next);
    if (!inviteGroupId && next[0]) setInviteGroupId(next[0]);
  };

  const handleSave = async () => {
    await saveConfig.mutateAsync(config);
    // Auto-register webhook when automation is on
    if (config.instance_id && (config.auto_move_on_join || config.auto_move_on_leave)) {
      try { await enableWebhook.mutateAsync(config); } catch (e) { /* surfaced by toast */ }
    }
  };
  const handlePreview = async () => setLastResult(await previewSync.mutateAsync(config));
  const handleApply = async () => setLastResult(await applySync.mutateAsync(config));
  const handleInvite = async () => setLastResult(await inviteMissing.mutateAsync({ ...config, invite_group_id: inviteGroupId }));

  return (
    <div className="space-y-4">
      <div>
        <h3 className="mb-2 flex items-center gap-2 text-lg font-semibold text-foreground">
          <Users className="h-5 w-5" /> Grupos WhatsApp
        </h3>
        <p className="text-sm text-muted-foreground">
          Compare os membros dos grupos com os contatos do Kanban e mova para as etapas escolhidas.
        </p>
      </div>

      <div className="space-y-4 rounded-md border border-border p-4">
        <div className="grid gap-3 md:grid-cols-[1fr_auto]">
          <div>
            <label className="mb-1 block text-sm font-medium text-foreground">Instância administradora</label>
            <Select value={config.instance_id || ''} onValueChange={value => update('instance_id', value)}>
              <SelectTrigger>
                <SelectValue placeholder="Escolha a instância UAZAPI" />
              </SelectTrigger>
              <SelectContent>
                {instances.map(instance => (
                  <SelectItem key={instance.id} value={instance.id}>{instance.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button variant="outline" className="self-end gap-2" onClick={handleLoadGroups} disabled={!config.instance_id || listGroups.isPending}>
            {listGroups.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            Buscar grupos
          </Button>
        </div>

        {groups.length > 0 && (
          <div className="space-y-2">
            <div className="text-sm font-medium text-foreground">Grupos monitorados</div>
            <div className="grid gap-2 md:grid-cols-2">
              {groups.map(group => (
                <label key={group.id} className="flex cursor-pointer items-start gap-2 rounded-md border border-border bg-background p-3 text-sm">
                  <Checkbox checked={selectedGroups.has(group.id)} onCheckedChange={checked => handleToggleGroup(group.id, !!checked)} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium text-foreground">{group.name}</span>
                    <span className="block truncate text-xs text-muted-foreground">{group.id}</span>
                  </span>
                </label>
              ))}
            </div>
          </div>
        )}

        <Separator />

        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <label className="mb-1 block text-sm font-medium text-foreground">Quem está na etapa</label>
            <StageSelect value={config.in_group_stage_id} onChange={value => update('in_group_stage_id', value)} stages={stages} placeholder="Mover para..." allowNone={false} />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-foreground">Mas não está na etapa</label>
            <StageSelect value={config.not_in_group_stage_id} onChange={value => update('not_in_group_stage_id', value)} stages={stages} placeholder="Mover para..." />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-foreground">Depois de convidar</label>
            <StageSelect value={config.invited_stage_id} onChange={value => update('invited_stage_id', value)} stages={stages} placeholder="Mover para..." />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-foreground">Quando sair do grupo</label>
            <StageSelect value={config.left_group_stage_id} onChange={value => update('left_group_stage_id', value)} stages={stages} placeholder="Mover para..." />
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          <label className="flex items-center justify-between gap-3 rounded-md bg-muted/30 p-3 text-sm">
            <span className="text-foreground">Webhook move quando entrar</span>
            <Switch checked={config.auto_move_on_join} onCheckedChange={value => update('auto_move_on_join', value)} />
          </label>
          <label className="flex items-center justify-between gap-3 rounded-md bg-muted/30 p-3 text-sm">
            <span className="text-foreground">Webhook move quando sair</span>
            <Switch checked={config.auto_move_on_leave} onCheckedChange={value => update('auto_move_on_leave', value)} />
          </label>
        </div>

        {!canRun && (
          <Alert>
            <AlertDescription>Escolha instância, pelo menos um grupo e a etapa para quem está no grupo.</AlertDescription>
          </Alert>
        )}

        {lastResult && <ResultPanel result={lastResult} stages={stages} config={config} />}

        {automationOn && config.instance_id && (
          <div className="rounded-md border border-border bg-muted/20 p-3 space-y-2">
            <div className="flex items-center gap-2 text-sm">
              {webhookStatus?.registered && webhookStatus?.hasGroups ? (
                <>
                  <CheckCircle2 className="h-4 w-4 text-green-600" />
                  <span className="font-medium text-foreground">Monitoramento ativo</span>
                  <span className="text-muted-foreground">— a UAZAPI vai notificar entradas e saídas em tempo real.</span>
                </>
              ) : webhookStatus ? (
                <>
                  <AlertCircle className="h-4 w-4 text-amber-600" />
                  <span className="font-medium text-foreground">Monitoramento não está completo</span>
                  <span className="text-muted-foreground">
                    {webhookStatus.error
                      ? `— ${webhookStatus.error}`
                      : webhookStatus.registered
                        ? '— webhook registrado mas sem evento "groups". Clique em "Ativar webhook".'
                        : '— webhook não registrado nesta instância. Clique em "Ativar webhook".'}
                  </span>
                </>
              ) : (
                <>
                  <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                  <span className="text-muted-foreground">Verificando status do webhook...</span>
                </>
              )}
            </div>

            {webhookEvents.length > 0 && (
              <div className="pt-2 border-t border-border">
                <div className="mb-1 flex items-center gap-2 text-xs font-medium text-foreground">
                  <Activity className="h-3.5 w-3.5" /> Últimos eventos recebidos
                </div>
                <div className="space-y-1 text-xs text-muted-foreground">
                  {webhookEvents.map(event => {
                    const action = event.payload?.action || '—';
                    const participants = (event.payload?.participants || []).slice(0, 2).join(', ');
                    const moved = (event.payload?.moved_in_count || 0) + (event.payload?.moved_out_count || 0);
                    const ago = formatDistanceToNow(new Date(event.created_at), { addSuffix: true, locale: ptBR });
                    return (
                      <div key={event.id} className="flex items-center justify-between gap-2">
                        <span className="truncate">
                          <Badge variant={event.status === 'success' ? 'default' : 'secondary'} className="mr-2">{action}</Badge>
                          {participants || 'sem participante'} · {ago}
                        </span>
                        <span className="text-foreground">{moved > 0 ? `+${moved} movido(s)` : event.error_message || event.status}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          <Button variant="outline" className="gap-2" onClick={handleSave} disabled={saveConfig.isPending || !config.instance_id}>
            {saveConfig.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Salvar
          </Button>
          <Button variant="outline" className="gap-2" onClick={handlePreview} disabled={!canRun || previewSync.isPending}>
            {previewSync.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            Simular
          </Button>
          <Button className="gap-2" onClick={handleApply} disabled={!canRun || applySync.isPending}>
            {applySync.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Users className="h-4 w-4" />}
            Aplicar movimentação
          </Button>
          <Select value={inviteGroupId || ''} onValueChange={setInviteGroupId}>
            <SelectTrigger className="w-full md:w-56">
              <SelectValue placeholder="Grupo do convite" />
            </SelectTrigger>
            <SelectContent>
              {config.group_ids.map(groupId => (
                <SelectItem key={groupId} value={groupId}>{groups.find(group => group.id === groupId)?.name || groupId}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant="outline" className="gap-2" onClick={handleInvite} disabled={!canRun || !config.invited_stage_id || inviteMissing.isPending}>
            {inviteMissing.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            Convidar ausentes
          </Button>
          <Button variant="outline" className="gap-2" onClick={() => enableWebhook.mutate(config)} disabled={!config.instance_id || enableWebhook.isPending}>
            {enableWebhook.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Webhook className="h-4 w-4" />}
            Ativar webhook
          </Button>
        </div>
      </div>
    </div>
  );
};

export default WhatsAppGroupSyncConfig;
