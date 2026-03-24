import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Zap, MoreVertical, Pencil, Trash2, Play, Pause } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { useWzFlows, useDeleteWzFlow, useToggleWzFlow } from '@/hooks/useWzFlows';
import type { WzFlow } from '@/types/wz-automation';

const platformLabels: Record<string, string> = {
  any: 'Qualquer',
  ticto: 'Ticto',
  guru: 'Guru',
};

export default function WzFlowList({ embedded = false }: { embedded?: boolean }) {
  const navigate = useNavigate();
  const { data: flows = [], isLoading } = useWzFlows();
  const deleteFlow = useDeleteWzFlow();
  const toggleFlow = useToggleWzFlow();
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);

  return (
    <div className="p-6 space-y-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Zap className="h-6 w-6 text-primary" />
            Automações WhatsApp
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Crie fluxos automatizados para envio de mensagens
          </p>
        </div>
        <Button onClick={() => navigate('/ferramentas/automacoes/novo')} className="gap-2">
          <Plus className="h-4 w-4" />
          Novo Fluxo
        </Button>
      </div>

      {/* Flow Cards */}
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-40 rounded-xl border border-border bg-card animate-pulse" />
          ))}
        </div>
      ) : flows.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="h-20 w-20 rounded-full bg-primary/10 flex items-center justify-center mb-4">
            <Zap className="h-10 w-10 text-primary" />
          </div>
          <h3 className="text-lg font-semibold text-foreground mb-1">Nenhum fluxo criado</h3>
          <p className="text-sm text-muted-foreground mb-4 max-w-sm">
            Crie seu primeiro fluxo de automação para enviar mensagens automáticas no WhatsApp.
          </p>
          <Button onClick={() => navigate('/ferramentas/automacoes/novo')} className="gap-2">
            <Plus className="h-4 w-4" />
            Criar Primeiro Fluxo
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {flows.map((flow) => (
            <FlowCard
              key={flow.id}
              flow={flow}
              onEdit={() => navigate(`/ferramentas/automacoes/${flow.id}`)}
              onDelete={() => setDeleteTarget(flow.id)}
              onToggle={(active) => toggleFlow.mutate({ id: flow.id, is_active: active })}
            />
          ))}
        </div>
      )}

      {/* Delete Dialog */}
      <AlertDialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover fluxo?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação não pode ser desfeita. O fluxo e todo o histórico de execuções serão removidos.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (deleteTarget) deleteFlow.mutate(deleteTarget);
                setDeleteTarget(null);
              }}
            >
              Remover
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function FlowCard({
  flow,
  onEdit,
  onDelete,
  onToggle,
}: {
  flow: WzFlow;
  onEdit: () => void;
  onDelete: () => void;
  onToggle: (active: boolean) => void;
}) {
  const triggerNodes = (flow.nodes || []).filter((n: any) => n.type === 'trigger');
  const actionNodes = (flow.nodes || []).filter((n: any) => n.type !== 'trigger');

  return (
    <div
      className="rounded-xl border border-border bg-card p-4 hover:shadow-md transition-shadow cursor-pointer group"
      onClick={onEdit}
    >
      <div className="flex items-start justify-between mb-3">
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-foreground truncate">{flow.name}</h3>
          {flow.description && (
            <p className="text-xs text-muted-foreground truncate mt-0.5">{flow.description}</p>
          )}
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
            <Button variant="ghost" size="icon" className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity">
              <MoreVertical className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onEdit(); }}>
              <Pencil className="h-4 w-4 mr-2" /> Editar
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={(e) => { e.stopPropagation(); onDelete(); }}
              className="text-destructive focus:text-destructive"
            >
              <Trash2 className="h-4 w-4 mr-2" /> Remover
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="flex items-center gap-2 mb-3">
        <Badge variant="outline" className="text-xs">
          {platformLabels[flow.platform] || flow.platform}
        </Badge>
        <span className="text-xs text-muted-foreground">
          {triggerNodes.length} gatilho{triggerNodes.length !== 1 ? 's' : ''} · {actionNodes.length} ação{actionNodes.length !== 1 ? 'ões' : ''}
        </span>
      </div>

      <div className="flex items-center justify-between pt-2 border-t border-border">
        <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
          <Switch
            checked={flow.is_active}
            onCheckedChange={onToggle}
            className="scale-90"
          />
          <span className="text-xs text-muted-foreground">
            {flow.is_active ? 'Ativo' : 'Inativo'}
          </span>
        </div>
        {flow.is_active ? (
          <div className="flex items-center gap-1 text-emerald-500">
            <Play className="h-3 w-3 fill-current" />
            <span className="text-xs font-medium">Rodando</span>
          </div>
        ) : (
          <div className="flex items-center gap-1 text-muted-foreground">
            <Pause className="h-3 w-3" />
            <span className="text-xs">Pausado</span>
          </div>
        )}
      </div>
    </div>
  );
}
