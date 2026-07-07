import React, { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { AlertTriangle, CalendarClock, Clock, Send, Tag, Users, XCircle } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import FunnelProductsConfig from '@/components/lead-funnels/FunnelProductsConfig';
import BulkEnrollDialog from '@/components/wz-automation/BulkEnrollDialog';
import { useToggleWzFlow, useUpdateWzFlow } from '@/hooks/useWzFlows';
import { useWzExecutions } from '@/hooks/useWzExecutions';
import { useManyChatTags } from '@/hooks/useManyChatTags';
import {
  applyDailyTimeUtc,
  applyDayTags,
  applyWebinarUrl,
  brtToUtc,
  parseWebinarFlow,
  utcToBrt,
} from '@/lib/webinarFlowParser';
import type { WzFlow } from '@/types/wz-automation';
import type { LeadFunnelProduct } from '@/hooks/useLeadFunnelProducts';
import type { FunnelProduct } from '@/hooks/useFunnels';
import type { LeadFunnelStage } from '@/types/leadFunnels';

interface FunnelWebinarTabProps {
  funnelId: string;
  flow: WzFlow;
  stages: LeadFunnelStage[];
  products: LeadFunnelProduct[];
  catalogProducts: FunnelProduct[];
  onSaveProducts: (products: any[]) => void;
  savingProducts: boolean;
}

const CHUNK = 200;

const FunnelWebinarTab: React.FC<FunnelWebinarTabProps> = ({
  funnelId,
  flow,
  stages,
  products,
  catalogProducts,
  onSaveProducts,
  savingProducts,
}) => {
  const queryClient = useQueryClient();
  const toggleFlow = useToggleWzFlow();
  const updateFlow = useUpdateWzFlow();
  const { data: tags = [], isLoading: loadingTags } = useManyChatTags();
  const { data: failedExecutions = [] } = useWzExecutions({ flowId: flow.id, status: 'failed' });

  const parse = useMemo(
    () => parseWebinarFlow(flow.nodes || [], flow.edges || []),
    [flow.nodes, flow.edges]
  );

  // ── Fila de disparos pendentes ────────────────────────────────────────────
  const { data: pendingInfo } = useQuery({
    queryKey: ['webinar-pending', flow.id],
    refetchInterval: 30_000,
    queryFn: async () => {
      const execIds: string[] = [];
      for (let offset = 0; ; offset += 1000) {
        const { data, error } = await (supabase as any)
          .from('wz_executions')
          .select('id')
          .eq('flow_id', flow.id)
          .range(offset, offset + 999);
        if (error) throw error;
        execIds.push(...(data || []).map((r: any) => r.id));
        if (!data || data.length < 1000) break;
      }
      let count = 0;
      let nextRunAt: string | null = null;
      for (let i = 0; i < execIds.length; i += CHUNK) {
        const { data, error } = await (supabase as any)
          .from('wz_scheduled_steps')
          .select('run_at')
          .in('execution_id', execIds.slice(i, i + CHUNK))
          .eq('status', 'pending');
        if (error) throw error;
        for (const row of data || []) {
          count++;
          if (!nextRunAt || row.run_at < nextRunAt) nextRunAt = row.run_at;
        }
      }
      return { count, nextRunAt };
    },
  });

  // ── Horário diário (exibido em Brasília; o flow guarda UTC) ───────────────
  const initialTimeBrt = utcToBrt(parse.commonTimeUtc ?? parse.days[0]?.targetTimeUtc ?? '12:00');
  const [timeBrt, setTimeBrt] = useState(initialTimeBrt);
  useEffect(() => setTimeBrt(initialTimeBrt), [initialTimeBrt]);
  const timeDirty = timeBrt !== initialTimeBrt || parse.commonTimeUtc === null;

  const handleSaveTime = async () => {
    try {
      await updateFlow.mutateAsync({
        id: flow.id,
        nodes: applyDailyTimeUtc(flow.nodes || [], brtToUtc(timeBrt)),
      });
      queryClient.invalidateQueries({ queryKey: ['lead-funnel-automations', funnelId] });
      toast.success(`Disparo diário salvo para ${timeBrt} (horário de Brasília)`);
    } catch {
      toast.error('Erro ao salvar o horário');
    }
  };

  // ── Link da live (rastreável) ─────────────────────────────────────────────
  const initialWebinarUrl = parse.days.find(d => d.webinarUrl)?.webinarUrl ?? '';
  const [webinarUrl, setWebinarUrl] = useState(initialWebinarUrl);
  useEffect(() => setWebinarUrl(initialWebinarUrl), [initialWebinarUrl]);
  const urlDirty = webinarUrl.trim() !== initialWebinarUrl;

  const handleSaveWebinarUrl = async () => {
    try {
      await updateFlow.mutateAsync({
        id: flow.id,
        nodes: applyWebinarUrl(flow.nodes || [], webinarUrl),
      });
      queryClient.invalidateQueries({ queryKey: ['lead-funnel-automations', funnelId] });
      toast.success(webinarUrl.trim() ? 'Link da live salvo — rastreio de presença ativo' : 'Rastreio de presença desligado');
    } catch {
      toast.error('Erro ao salvar o link da live');
    }
  };

  // ── Tags por dia ──────────────────────────────────────────────────────────
  const [dayTags, setDayTags] = useState<Record<string, string>>({});
  useEffect(() => setDayTags({}), [flow.nodes]);
  const tagsDirty = Object.keys(dayTags).length > 0;

  const handleSaveTags = async () => {
    try {
      const updates = Object.entries(dayTags).map(([nodeId, tagName]) => ({ nodeId, tagName }));
      await updateFlow.mutateAsync({
        id: flow.id,
        nodes: applyDayTags(flow.nodes || [], updates),
      });
      queryClient.invalidateQueries({ queryKey: ['lead-funnel-automations', funnelId] });
      setDayTags({});
      toast.success('Tags da sequência salvas');
    } catch {
      toast.error('Erro ao salvar as tags');
    }
  };

  // ── Cancelar disparos pendentes ───────────────────────────────────────────
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [cancelPreview, setCancelPreview] = useState<{ pending_steps: number; active_executions: number } | null>(null);

  const openCancelDialog = async () => {
    setCancelPreview(null);
    setCancelOpen(true);
    const { data, error } = await supabase.functions.invoke('wz-cancel-pending', {
      body: { flow_id: flow.id, dry_run: true },
    });
    if (error) {
      toast.error('Erro ao consultar a fila');
      setCancelOpen(false);
      return;
    }
    setCancelPreview({ pending_steps: data.pending_steps ?? 0, active_executions: data.active_executions ?? 0 });
  };

  const handleCancelPending = async () => {
    setCancelling(true);
    try {
      const { data, error } = await supabase.functions.invoke('wz-cancel-pending', {
        body: { flow_id: flow.id },
      });
      if (error) throw error;
      toast.success(`${data.cancelled_steps} disparo(s) cancelado(s), ${data.cancelled_executions} sequência(s) encerrada(s)`);
      queryClient.invalidateQueries({ queryKey: ['webinar-pending', flow.id] });
      queryClient.invalidateQueries({ queryKey: ['wz-executions'] });
    } catch {
      toast.error('Erro ao cancelar disparos');
    } finally {
      setCancelling(false);
      setCancelOpen(false);
    }
  };

  const [bulkEnrollOpen, setBulkEnrollOpen] = useState(false);

  const recentErrors = failedExecutions.slice(0, 5);

  return (
    <div className="space-y-6">
      {/* ── Status ── */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2 text-base">
                <Send className="h-4 w-4" />
                Sequência do Webinário
              </CardTitle>
              <CardDescription>
                Quem compra os produtos configurados abaixo entra automaticamente e recebe uma mensagem por dia.
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant={flow.is_active ? 'default' : 'secondary'}>
                {flow.is_active ? 'Ativa' : 'Pausada'}
              </Badge>
              <Switch
                checked={flow.is_active}
                disabled={toggleFlow.isPending}
                onCheckedChange={async (checked) => {
                  await toggleFlow.mutateAsync({ id: flow.id, is_active: checked });
                  queryClient.invalidateQueries({ queryKey: ['lead-funnel-automations', funnelId] });
                  toast.success(checked ? 'Sequência ativada' : 'Sequência pausada — novos compradores não entram mais; disparos já agendados continuam (use "Cancelar disparos pendentes" para pará-los)');
                }}
              />
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap gap-4 text-sm">
            <span className="flex items-center gap-1.5">
              <CalendarClock className="h-4 w-4 text-muted-foreground" />
              <strong>{pendingInfo?.count ?? '…'}</strong>&nbsp;disparo(s) agendado(s)
            </span>
            {pendingInfo?.nextRunAt && (
              <span className="flex items-center gap-1.5 text-muted-foreground">
                <Clock className="h-4 w-4" />
                Próximo: {format(new Date(pendingInfo.nextRunAt), "dd/MM 'às' HH:mm", { locale: ptBR })} (horário de Brasília)
              </span>
            )}
          </div>
          {recentErrors.length > 0 && (
            <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-xs space-y-1">
              <p className="font-medium text-destructive flex items-center gap-1">
                <AlertTriangle className="h-3.5 w-3.5" /> Últimos erros
              </p>
              {recentErrors.map((e) => (
                <p key={e.id} className="text-muted-foreground">
                  {format(new Date(e.started_at), 'dd/MM HH:mm', { locale: ptBR })} — {e.contact_name || e.contact_phone || 'lead sem nome'}
                </p>
              ))}
            </div>
          )}
          <div className="flex flex-wrap gap-2 pt-1">
            <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setBulkEnrollOpen(true)}>
              <Users className="h-4 w-4" />
              Aplicar a leads existentes
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5 text-destructive border-destructive/30 hover:bg-destructive/10"
              onClick={openCancelDialog}
            >
              <XCircle className="h-4 w-4" />
              Cancelar disparos pendentes
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* ── Horário ── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Clock className="h-4 w-4" />
            Disparo diário às…
          </CardTitle>
          <CardDescription>
            Horário em que a mensagem de cada dia é enviada — <strong>horário de Brasília</strong>.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-end gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="webinar-time">Horário</Label>
              <Input
                id="webinar-time"
                type="time"
                className="w-32"
                value={timeBrt}
                onChange={(e) => setTimeBrt(e.target.value)}
              />
            </div>
            <Button onClick={handleSaveTime} disabled={!timeDirty || updateFlow.isPending}>
              {updateFlow.isPending ? 'Salvando…' : 'Salvar horário'}
            </Button>
            {parse.commonTimeUtc === null && parse.days.length > 0 && (
              <p className="text-xs text-amber-600 dark:text-amber-500 pb-2">
                Os dias estão com horários diferentes — salvar unifica todos neste horário.
              </p>
            )}
          </div>
          <div className="space-y-1.5 border-t border-border pt-4">
            <Label htmlFor="webinar-url">Link da live (rastreável)</Label>
            <div className="flex items-center gap-3">
              <Input
                id="webinar-url"
                type="url"
                placeholder="https://… (página/sala da live)"
                value={webinarUrl}
                onChange={(e) => setWebinarUrl(e.target.value)}
              />
              <Button onClick={handleSaveWebinarUrl} disabled={!urlDirty || updateFlow.isPending}>
                {updateFlow.isPending ? 'Salvando…' : 'Salvar link'}
              </Button>
            </div>
            <p className="text-[11px] text-muted-foreground">
              Com o link preenchido, cada lead recebe no ManyChat um campo <strong>link_webinario</strong> com
              um link personalizado: ao clicar, registramos que ele foi assistir (tag "assistiu" + coluna
              "Confirmou") e redirecionamos pra live. Use <code>{'{{link_webinario}}'}</code> no botão da mensagem.
              Deixe vazio pra mandar sem rastreio.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* ── Dias da sequência ── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Tag className="h-4 w-4" />
            Mensagens da sequência
          </CardTitle>
          <CardDescription>
            Cada dia marca uma tag no ManyChat — é a tag que dispara a mensagem de lá. A coluna do kanban avança junto.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {parse.warnings.length > 0 && (
            <div className="rounded-md border border-amber-500/30 bg-amber-500/5 p-2.5 text-xs text-amber-700 dark:text-amber-500">
              {parse.warnings.map((w, i) => (
                <p key={i}>• {w}</p>
              ))}
            </div>
          )}
          <div className="space-y-2">
            {parse.days.map((day) => {
              const currentTag = day.manychatNodeId
                ? (dayTags[day.manychatNodeId] ?? day.tagName)
                : day.tagName;
              return (
                <div key={day.delayNodeId} className="flex items-center gap-3 rounded-md border border-border p-2.5">
                  <Badge variant="outline" className="shrink-0 w-16 justify-center">Dia {day.dayNumber}</Badge>
                  <div className="flex-1 min-w-0">
                    {day.manychatNodeId ? (
                      tags.length > 0 ? (
                        <Select
                          value={currentTag || ''}
                          onValueChange={(v) => setDayTags(prev => ({ ...prev, [day.manychatNodeId!]: v }))}
                        >
                          <SelectTrigger className="h-9">
                            <SelectValue placeholder={loadingTags ? 'Carregando…' : 'Escolha a tag do ManyChat'} />
                          </SelectTrigger>
                          <SelectContent className="max-h-72">
                            {currentTag && !tags.some((t: any) => t.name === currentTag) && (
                              <SelectItem value={currentTag}>{currentTag} (não existe no ManyChat ainda)</SelectItem>
                            )}
                            {tags.map((t: any) => (
                              <SelectItem key={t.id} value={t.name}>{t.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      ) : (
                        <Input
                          className="h-9"
                          value={currentTag || ''}
                          onChange={(e) => setDayTags(prev => ({ ...prev, [day.manychatNodeId!]: e.target.value }))}
                          placeholder={loadingTags ? 'Carregando tags…' : 'Nome exato da tag no ManyChat'}
                        />
                      )
                    ) : (
                      <span className="text-xs text-muted-foreground">Sem envio configurado neste dia</span>
                    )}
                  </div>
                  {day.stageName && (
                    <Badge variant="secondary" className="shrink-0 font-normal">→ {day.stageName}</Badge>
                  )}
                </div>
              );
            })}
          </div>
          {parse.finalStage && (
            <p className="text-xs text-muted-foreground">
              Depois do último dia, o lead vai para: <strong>{parse.finalStage.stageName}</strong>
            </p>
          )}
          <Button onClick={handleSaveTags} disabled={!tagsDirty || updateFlow.isPending}>
            {updateFlow.isPending ? 'Salvando…' : 'Salvar tags'}
          </Button>
        </CardContent>
      </Card>

      {/* ── Produtos ── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Quais produtos entram nesta sequência</CardTitle>
          <CardDescription>
            Quem compra qualquer produto cujo nome contenha um dos termos abaixo entra automaticamente no funil
            (e, com a sequência ativa, começa a receber as mensagens).
          </CardDescription>
        </CardHeader>
        <CardContent>
          <FunnelProductsConfig
            products={products}
            catalogProducts={catalogProducts}
            stages={stages}
            onSave={onSaveProducts}
            saving={savingProducts}
          />
        </CardContent>
      </Card>

      {/* ── Diálogos ── */}
      <AlertDialog open={cancelOpen} onOpenChange={setCancelOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancelar disparos pendentes?</AlertDialogTitle>
            <AlertDialogDescription>
              {cancelPreview
                ? `Isso vai cancelar ${cancelPreview.pending_steps} disparo(s) agendado(s) e encerrar ${cancelPreview.active_executions} sequência(s) em andamento. Os leads permanecem no funil; mensagens já enviadas não são afetadas. Essa ação não pode ser desfeita.`
                : 'Consultando a fila…'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Voltar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleCancelPending}
              disabled={cancelling || !cancelPreview}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {cancelling ? 'Cancelando…' : 'Sim, cancelar tudo'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <BulkEnrollDialog
        open={bulkEnrollOpen}
        onOpenChange={setBulkEnrollOpen}
        flowId={flow.id}
        flowName={flow.name}
        isFlowActive={flow.is_active}
      />
    </div>
  );
};

export default FunnelWebinarTab;
