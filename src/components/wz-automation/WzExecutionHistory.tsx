import React, { useState } from 'react';
import { format, formatDistanceStrict } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { ChevronDown, ChevronRight, Filter, CheckCircle2, XCircle, Clock, AlertTriangle, Activity, Timer } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent } from '@/components/ui/card';
import { useWzExecutions } from '@/hooks/useWzExecutions';
import { useWzFlows } from '@/hooks/useWzFlows';
import { useWzExecutionLogs } from '@/hooks/useWzExecutionLogs';
import { useWzExecutionStats } from '@/hooks/useWzExecutionStats';
import type { WzExecutionLog } from '@/types/wz-automation';

const statusConfig: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
  running: { label: 'Executando', variant: 'default' },
  completed: { label: 'Concluído', variant: 'secondary' },
  failed: { label: 'Falhou', variant: 'destructive' },
  waiting: { label: 'Aguardando', variant: 'outline' },
  cancelled: { label: 'Cancelado', variant: 'outline' },
};

const nodeTypeLabels: Record<string, string> = {
  trigger: 'Trigger',
  whatsapp: 'WhatsApp',
  timer: 'Timer',
  smart_delay: 'Smart Delay',
  condition: 'Condição',
  ab_split: 'Teste A/B',
  webhook: 'Webhook',
  tag: 'Tag',
  goto: 'Goto',
  stop: 'Parar',
  note: 'Nota',
};

function NodeTimeline({ executionId }: { executionId: string }) {
  const { data: logs = [], isLoading } = useWzExecutionLogs(executionId);
  const [expandedLog, setExpandedLog] = useState<string | null>(null);

  if (isLoading) return <p className="text-xs text-muted-foreground py-2">Carregando logs...</p>;
  if (logs.length === 0) return <p className="text-xs text-muted-foreground py-2">Nenhum log de nó registrado (execução anterior ao sistema de logs)</p>;

  return (
    <div className="space-y-1">
      <p className="text-xs font-semibold text-muted-foreground mb-2">Timeline de execução:</p>
      {logs.map((log) => {
        const isOpen = expandedLog === log.id;
        const duration = log.finished_at
          ? `${((new Date(log.finished_at).getTime() - new Date(log.started_at).getTime()) / 1000).toFixed(1)}s`
          : '...';
        const StatusIcon = log.status === 'success' ? CheckCircle2 : log.status === 'failed' ? XCircle : log.status === 'skipped' ? AlertTriangle : Clock;
        const iconColor = log.status === 'success' ? 'text-green-500' : log.status === 'failed' ? 'text-red-500' : log.status === 'skipped' ? 'text-yellow-500' : 'text-muted-foreground';

        return (
          <div key={log.id}>
            <div
              className="flex items-center gap-2 px-3 py-1.5 rounded-md hover:bg-muted/40 cursor-pointer transition-colors text-xs"
              onClick={(e) => { e.stopPropagation(); setExpandedLog(isOpen ? null : log.id); }}
            >
              <StatusIcon className={`h-3.5 w-3.5 shrink-0 ${iconColor}`} />
              <span className="font-medium text-foreground">{nodeTypeLabels[log.node_type] || log.node_type}</span>
              {log.output_data?.summary && (
                <span className="text-muted-foreground truncate max-w-[200px]">({log.output_data.summary})</span>
              )}
              <span className="ml-auto text-muted-foreground">{duration}</span>
            </div>
            {isOpen && (
              <div className="ml-6 mb-2 p-3 bg-card rounded-lg border border-border text-xs space-y-2">
                {log.error_message && (
                  <div className="text-red-400">
                    <span className="font-semibold">Erro:</span> {log.error_message}
                  </div>
                )}
                {log.input_data && (
                  <div>
                    <span className="font-semibold text-muted-foreground">Input:</span>
                    <pre className="mt-1 bg-muted/30 rounded p-2 overflow-auto max-h-32">{JSON.stringify(log.input_data, null, 2)}</pre>
                  </div>
                )}
                {log.output_data && (
                  <div>
                    <span className="font-semibold text-muted-foreground">Output:</span>
                    <pre className="mt-1 bg-muted/30 rounded p-2 overflow-auto max-h-32">{JSON.stringify(log.output_data, null, 2)}</pre>
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function StatsCards() {
  const { data: stats } = useWzExecutionStats();
  if (!stats) return null;

  const successRate = stats.totalToday > 0
    ? ((stats.completedToday / stats.totalToday) * 100).toFixed(0)
    : '—';

  const avgDuration = stats.avgDurationMs > 0
    ? stats.avgDurationMs > 60000
      ? `${(stats.avgDurationMs / 60000).toFixed(1)}min`
      : `${(stats.avgDurationMs / 1000).toFixed(1)}s`
    : '—';

  const cards = [
    { label: 'Hoje', value: stats.totalToday, sub: `${stats.totalWeek} últimos 7d`, icon: Activity },
    { label: 'Concluídas', value: `${successRate}%`, sub: `${stats.failedToday} falharam`, icon: CheckCircle2 },
    { label: 'Tempo médio', value: avgDuration, sub: 'execução completa', icon: Timer },
    { label: 'Pendentes', value: stats.pendingSteps, sub: 'steps agendados', icon: Clock },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      {cards.map((c) => (
        <Card key={c.label} className="border-border">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1">
              <c.icon className="h-4 w-4 text-muted-foreground" />
              <span className="text-xs text-muted-foreground">{c.label}</span>
            </div>
            <p className="text-2xl font-bold text-foreground">{c.value}</p>
            <p className="text-xs text-muted-foreground">{c.sub}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

export default function WzExecutionHistory() {
  const [flowFilter, setFlowFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const { data: flows = [] } = useWzFlows();
  const { data: executions = [], isLoading } = useWzExecutions({
    flowId: flowFilter !== 'all' ? flowFilter : undefined,
    status: statusFilter !== 'all' ? statusFilter : undefined,
  });

  return (
    <div className="p-6 space-y-6 max-w-6xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Histórico de Execuções</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Acompanhe todas as execuções de automações
        </p>
      </div>

      {/* Stats */}
      <StatsCards />

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <Filter className="h-4 w-4 text-muted-foreground" />
        <Select value={flowFilter} onValueChange={setFlowFilter}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder="Todos os fluxos" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os fluxos</SelectItem>
            {flows.map(f => (
              <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Todos os status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            <SelectItem value="running">Executando</SelectItem>
            <SelectItem value="completed">Concluído</SelectItem>
            <SelectItem value="failed">Falhou</SelectItem>
            <SelectItem value="waiting">Aguardando</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      <div className="rounded-xl border border-border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr>
              <th className="w-8" />
              <th className="text-left px-4 py-3 font-medium text-muted-foreground">Fluxo</th>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground">Contato</th>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground">Telefone</th>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground">Evento</th>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground">Status</th>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground">Início</th>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground">Duração</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr><td colSpan={8} className="text-center py-12 text-muted-foreground">Carregando...</td></tr>
            ) : executions.length === 0 ? (
              <tr><td colSpan={8} className="text-center py-12 text-muted-foreground">Nenhuma execução encontrada</td></tr>
            ) : (
              executions.map(exec => {
                const isOpen = expandedId === exec.id;
                const cfg = statusConfig[exec.status] || statusConfig.running;
                const duration = exec.finished_at
                  ? formatDistanceStrict(new Date(exec.finished_at), new Date(exec.started_at), { locale: ptBR })
                  : '—';

                return (
                  <React.Fragment key={exec.id}>
                    <tr
                      className="border-t border-border hover:bg-muted/30 cursor-pointer transition-colors"
                      onClick={() => setExpandedId(isOpen ? null : exec.id)}
                    >
                      <td className="px-2 py-3">
                        {isOpen ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
                      </td>
                      <td className="px-4 py-3 font-medium text-foreground">{exec.flow_name}</td>
                      <td className="px-4 py-3 text-foreground">{exec.contact_name || '—'}</td>
                      <td className="px-4 py-3 text-foreground font-mono text-xs">{exec.contact_phone || '—'}</td>
                      <td className="px-4 py-3 text-muted-foreground">{exec.trigger_event || '—'}</td>
                      <td className="px-4 py-3">
                        <Badge variant={cfg.variant}>{cfg.label}</Badge>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground text-xs">
                        {format(new Date(exec.started_at), "dd/MM HH:mm", { locale: ptBR })}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground text-xs">{duration}</td>
                    </tr>
                    {isOpen && (
                      <tr className="bg-muted/20">
                        <td colSpan={8} className="px-6 py-4">
                          <NodeTimeline executionId={exec.id} />
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
