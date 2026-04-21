import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Zap, MoreVertical, Pencil, Trash2, Play, Pause, Copy, ChevronDown, ChevronRight, List, LayoutGrid, Filter } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { useWzFlows, useDeleteWzFlow, useToggleWzFlow, useDuplicateWzFlow } from '@/hooks/useWzFlows';
import { useLeadFunnels } from '@/hooks/useLeadFunnels';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { WzFlow } from '@/types/wz-automation';

const platformLabels: Record<string, string> = {
  any: 'Qualquer',
  ticto: 'Ticto',
  guru: 'Guru',
};

interface FunnelInfo {
  id: string;
  name: string;
  color: string | null;
}

interface FunnelAutomationRow {
  wz_flow_id: string;
  show_in_automations: boolean;
  funnel_id: string;
  lead_funnels: FunnelInfo | null;
}

interface FunnelGroup {
  id: string;
  name: string;
  color: string | null;
  flows: WzFlow[];
}

export default function WzFlowList({ embedded = false }: { embedded?: boolean }) {
  const navigate = useNavigate();
  const { data: flows = [], isLoading } = useWzFlows();
  const deleteFlow = useDeleteWzFlow();
  const toggleFlow = useToggleWzFlow();
  const duplicateFlow = useDuplicateWzFlow();
  const { data: leadFunnels = [] } = useLeadFunnels();
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [duplicateTarget, setDuplicateTarget] = useState<WzFlow | null>(null);
  const [duplicateMode, setDuplicateMode] = useState<'standalone' | 'funnel'>('standalone');
  const [targetFunnelId, setTargetFunnelId] = useState<string>('');
  const [funnelFilter, setFunnelFilter] = useState<string>('all');
  const [viewMode, setViewMode] = useState<'grouped' | 'flat'>('grouped');
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set());
  const [initialized, setInitialized] = useState(false);

  // Fetch funnel automations with funnel info
  const { data: funnelAutomations = [] } = useQuery({
    queryKey: ['lead-funnel-automations-visibility'],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('lead_funnel_automations')
        .select('wz_flow_id, show_in_automations, funnel_id, lead_funnels(id, name, color)');
      if (error) throw error;
      return (data || []) as FunnelAutomationRow[];
    },
  });

  // Filter: hide flows that are linked to funnels but have NO link with show_in_automations=true
  const visibleFlows = useMemo(() => {
    const flowVisibility = new Map<string, boolean>();
    for (const auto of funnelAutomations) {
      const current = flowVisibility.get(auto.wz_flow_id) || false;
      flowVisibility.set(auto.wz_flow_id, current || auto.show_in_automations);
    }
    
    return flows.filter(flow => {
      if (!flowVisibility.has(flow.id)) return true;
      return flowVisibility.get(flow.id) === true;
    });
  }, [flows, funnelAutomations]);

  // Build funnel groups
  const { groups, allFunnels } = useMemo(() => {
    // Map flow_id -> list of funnels
    const flowFunnels = new Map<string, FunnelInfo[]>();
    const funnelMap = new Map<string, FunnelInfo>();

    for (const auto of funnelAutomations) {
      if (auto.lead_funnels) {
        funnelMap.set(auto.lead_funnels.id, auto.lead_funnels);
        const existing = flowFunnels.get(auto.wz_flow_id) || [];
        if (!existing.find(f => f.id === auto.lead_funnels!.id)) {
          existing.push(auto.lead_funnels);
        }
        flowFunnels.set(auto.wz_flow_id, existing);
      }
    }

    const groupMap = new Map<string, FunnelGroup>();
    const standalone: WzFlow[] = [];

    for (const flow of visibleFlows) {
      const funnels = flowFunnels.get(flow.id);
      if (!funnels || funnels.length === 0) {
        standalone.push(flow);
      } else {
        for (const funnel of funnels) {
          if (!groupMap.has(funnel.id)) {
            groupMap.set(funnel.id, { id: funnel.id, name: funnel.name, color: funnel.color, flows: [] });
          }
          groupMap.get(funnel.id)!.flows.push(flow);
        }
      }
    }

    const result: FunnelGroup[] = [...groupMap.values()].sort((a, b) => a.name.localeCompare(b.name));
    if (standalone.length > 0) {
      result.push({ id: 'standalone', name: 'Avulsos', color: null, flows: standalone });
    }

    return { groups: result, allFunnels: [...funnelMap.values()].sort((a, b) => a.name.localeCompare(b.name)) };
  }, [visibleFlows, funnelAutomations]);

  // Initialize all sections as expanded once groups load
  if (!initialized && groups.length > 0) {
    setExpandedSections(new Set(groups.map(g => g.id)));
    setInitialized(true);
  }

  const filteredGroups = useMemo(() => {
    if (funnelFilter === 'all') return groups;
    return groups.filter(g => g.id === funnelFilter);
  }, [groups, funnelFilter]);

  const toggleSection = (id: string) => {
    setExpandedSections(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const openDuplicateDialog = (flow: WzFlow) => {
    setDuplicateTarget(flow);
    setDuplicateMode('standalone');
    setTargetFunnelId('');
  };

  const confirmDuplicate = () => {
    if (!duplicateTarget) return;
    duplicateFlow.mutate(
      {
        id: duplicateTarget.id,
        targetFunnelId: duplicateMode === 'funnel' ? targetFunnelId : null,
        showInAutomations: true,
      },
      {
        onSuccess: () => {
          setDuplicateTarget(null);
          setDuplicateMode('standalone');
          setTargetFunnelId('');
        },
      },
    );
  };

  const renderFlowGrid = (flowList: WzFlow[]) => (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {flowList.map((flow) => (
        <FlowCard
          key={flow.id}
          flow={flow}
          onEdit={() => navigate(`/ferramentas/automacoes/${flow.id}`)}
          onDelete={() => setDeleteTarget(flow.id)}
          onDuplicate={() => openDuplicateDialog(flow)}
          onToggle={(active) => toggleFlow.mutate({ id: flow.id, is_active: active })}
        />
      ))}
    </div>
  );

  return (
    <div className={embedded ? 'space-y-6' : 'p-6 space-y-6 max-w-6xl mx-auto'}>
      {/* Header */}
      {!embedded && (
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
      )}
      {embedded && (
        <div className="flex justify-end">
          <Button onClick={() => navigate('/ferramentas/automacoes/novo')} className="gap-2">
            <Plus className="h-4 w-4" />
            Novo Fluxo
          </Button>
        </div>
      )}

      {/* Toolbar: Filter + View Toggle */}
      {!isLoading && visibleFlows.length > 0 && (
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <Filter className="h-4 w-4 text-muted-foreground" />
            <Select value={funnelFilter} onValueChange={setFunnelFilter}>
              <SelectTrigger className="w-[200px] h-9 text-sm">
                <SelectValue placeholder="Filtrar por funil" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os funis</SelectItem>
                {allFunnels.map(f => (
                  <SelectItem key={f.id} value={f.id}>
                    <span className="flex items-center gap-2">
                      {f.color && (
                        <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: f.color }} />
                      )}
                      {f.name}
                    </span>
                  </SelectItem>
                ))}
                <SelectItem value="standalone">Avulsos</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center border border-border rounded-md overflow-hidden ml-auto">
            <Button
              variant={viewMode === 'grouped' ? 'secondary' : 'ghost'}
              size="sm"
              className="rounded-none h-9 px-3"
              onClick={() => setViewMode('grouped')}
            >
              <List className="h-4 w-4" />
            </Button>
            <Button
              variant={viewMode === 'flat' ? 'secondary' : 'ghost'}
              size="sm"
              className="rounded-none h-9 px-3"
              onClick={() => setViewMode('flat')}
            >
              <LayoutGrid className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {/* Flow Cards */}
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-40 rounded-xl border border-border bg-card animate-pulse" />
          ))}
        </div>
      ) : visibleFlows.length === 0 ? (
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
      ) : viewMode === 'flat' ? (
        renderFlowGrid(funnelFilter === 'all' ? visibleFlows : filteredGroups.flatMap(g => g.flows))
      ) : (
        <div className="space-y-4">
          {filteredGroups.map((group) => (
            <Collapsible
              key={group.id}
              open={expandedSections.has(group.id)}
              onOpenChange={() => toggleSection(group.id)}
            >
              <CollapsibleTrigger className="flex items-center gap-2 w-full p-3 rounded-lg bg-muted/50 hover:bg-muted transition-colors group/section">
                {expandedSections.has(group.id) ? (
                  <ChevronDown className="h-4 w-4 text-muted-foreground" />
                ) : (
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                )}
                {group.color && (
                  <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: group.color }} />
                )}
                <span className="font-semibold text-foreground text-sm">{group.name}</span>
                <Badge variant="secondary" className="text-xs ml-1">
                  {group.flows.length} automaç{group.flows.length !== 1 ? 'ões' : 'ão'}
                </Badge>
              </CollapsibleTrigger>
              <CollapsibleContent className="pt-3 pl-2">
                {renderFlowGrid(group.flows)}
              </CollapsibleContent>
            </Collapsible>
          ))}
        </div>
      )}

      <Dialog open={!!duplicateTarget} onOpenChange={(open) => !open && setDuplicateTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Duplicar automação</DialogTitle>
            <DialogDescription>
              Escolha como salvar a cópia de “{duplicateTarget?.name}”.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <button
              type="button"
              onClick={() => setDuplicateMode('standalone')}
              className={`w-full rounded-lg border p-4 text-left transition-colors ${duplicateMode === 'standalone' ? 'border-primary bg-primary/10' : 'border-border bg-background hover:bg-muted/50'}`}
            >
              <span className="block text-sm font-medium text-foreground">Avulsa / sem funil</span>
              <span className="block text-xs text-muted-foreground mt-1">A cópia aparece em Avulsos e não fica presa a nenhum CRM.</span>
            </button>

            <button
              type="button"
              onClick={() => setDuplicateMode('funnel')}
              className={`w-full rounded-lg border p-4 text-left transition-colors ${duplicateMode === 'funnel' ? 'border-primary bg-primary/10' : 'border-border bg-background hover:bg-muted/50'}`}
            >
              <span className="block text-sm font-medium text-foreground">Vincular a um Funil de Leads</span>
              <span className="block text-xs text-muted-foreground mt-1">A cópia já aparece dentro do funil escolhido.</span>
            </button>

            {duplicateMode === 'funnel' && (
              <Select value={targetFunnelId} onValueChange={setTargetFunnelId}>
                <SelectTrigger>
                  <SelectValue placeholder="Escolha o funil de leads" />
                </SelectTrigger>
                <SelectContent>
                  {leadFunnels.map((funnel: any) => (
                    <SelectItem key={funnel.id} value={funnel.id}>{funnel.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDuplicateTarget(null)}>Cancelar</Button>
            <Button
              onClick={confirmDuplicate}
              disabled={duplicateFlow.isPending || (duplicateMode === 'funnel' && !targetFunnelId)}
            >
              {duplicateFlow.isPending ? 'Duplicando...' : 'Duplicar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
  onDuplicate,
  onToggle,
}: {
  flow: WzFlow;
  onEdit: () => void;
  onDelete: () => void;
  onDuplicate: () => void;
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
            <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onDuplicate(); }}>
              <Copy className="h-4 w-4 mr-2" /> Duplicar
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
          {triggerNodes.length} gatilho{triggerNodes.length !== 1 ? 's' : ''} · {actionNodes.length} aç{actionNodes.length !== 1 ? 'ões' : 'ão'}
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
