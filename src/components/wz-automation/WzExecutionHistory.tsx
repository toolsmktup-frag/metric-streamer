import React, { useState } from 'react';
import { format, formatDistanceStrict } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { ChevronDown, ChevronRight, Filter } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { useWzExecutions } from '@/hooks/useWzExecutions';
import { useWzFlows } from '@/hooks/useWzFlows';

const statusConfig: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
  running: { label: 'Executando', variant: 'default' },
  completed: { label: 'Concluído', variant: 'secondary' },
  failed: { label: 'Falhou', variant: 'destructive' },
  waiting: { label: 'Aguardando', variant: 'outline' },
};

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
                          <p className="text-xs font-semibold text-muted-foreground mb-2">Payload do evento:</p>
                          <pre className="text-xs bg-card rounded-lg p-3 border border-border overflow-auto max-h-48 text-foreground">
                            {JSON.stringify(exec.trigger_payload || exec.variables, null, 2)}
                          </pre>
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
