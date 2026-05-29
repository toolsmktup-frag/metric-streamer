import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { LeadFunnelStage, Lead, LeadStagePosition, StageTransitionRule, ValueClassification } from '@/types/leadFunnels';
import LeadCard from './LeadCard';
import { Search, ArrowUpDown, DollarSign, TrendingDown, ChevronDown, RefreshCw, Hourglass, AlertTriangle } from 'lucide-react';
import { formatCurrency } from '@/lib/formatters';
import { isRevenueStage } from '@/lib/revenueStage';
import { extractMetadataAmount, classificationColor, classificationLabel, getDefaultClassification } from '@/lib/valueClassification';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  DndContext,
  DragOverlay,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  useDroppable,
  type DragStartEvent,
  type DragEndEvent,
} from '@dnd-kit/core';
import { useMoveLeadStage } from '@/hooks/useMoveLeadStage';
import { useBulkLeadPurchases, type PurchaseSummary } from '@/hooks/useBulkLeadPurchases';
import { useBulkLeadPurchaseProducts } from '@/hooks/useBulkLeadPurchaseProducts';
import type { RecontactInfo } from '@/hooks/useRecontactDeadlines';
import { supabase } from '@/integrations/supabase/client';
import { useQueryClient } from '@tanstack/react-query';
import { KanbanFiltersBar } from './KanbanFiltersBar';
import { EMPTY_FILTERS, matchesFilters, type KanbanFilters } from '@/lib/kanbanFilters';

const CARDS_PER_PAGE = 50;

interface KanbanBoardProps {
  stages: LeadFunnelStage[];
  positions: (LeadStagePosition & { lead: Lead })[];
  onLeadClick?: (leadId: string) => void;
  onWhatsAppClick?: (phone: string) => void;
  funnelId: string;
  recontactMap?: Map<string, RecontactInfo>;
  userRole?: string;
  currentUserId?: string | null;
  onBulkMoveOverdue?: () => void;
  bulkMoving?: boolean;
  hasAutoMoveProducts?: boolean;
  transitionRules?: StageTransitionRule[];
}

type SortMode = 'recent' | 'value' | 'orders' | 'ltv' | 'recontact';

const SORT_LABELS: Record<SortMode, string> = {
  recent: 'Mais recentes',
  value: 'Maior valor',
  orders: 'Mais compras',
  ltv: 'Maior LTV',
  recontact: 'Recontato',
};

const SORT_CYCLE: SortMode[] = ['recent', 'value', 'orders', 'ltv', 'recontact'];

/* Droppable column wrapper */
const DroppableColumn: React.FC<{ id: string; isOver: boolean; children: React.ReactNode }> = ({ id, isOver, children }) => {
  const { setNodeRef } = useDroppable({ id });
  return (
    <div
      ref={setNodeRef}
      className={`p-2 space-y-2 min-h-[200px] max-h-[60vh] overflow-y-auto transition-colors ${
        isOver ? 'bg-primary/5 ring-2 ring-primary/30 rounded-lg' : ''
      }`}
    >
      {children}
    </div>
  );
};

const KanbanBoard: React.FC<KanbanBoardProps> = ({ stages, positions, onLeadClick, onWhatsAppClick, funnelId, recontactMap, userRole, currentUserId, onBulkMoveOverdue, bulkMoving, hasAutoMoveProducts, transitionRules = [] }) => {
  const queryClient = useQueryClient();
  const isSeller = userRole === 'vendedor' || userRole === 'vendedora' || userRole === 'suporte';
  const isAdmin = userRole === 'admin' || userRole === 'gestor';

  // Realtime: when a lead's assigned_to changes, refetch kanban data instantly
  useEffect(() => {
    const channel = supabase
      .channel('kanban-leads-assign')
      .on(
        'postgres_changes' as any,
        { event: 'UPDATE', schema: 'public', table: 'leads' },
        () => {
          queryClient.invalidateQueries({ queryKey: ['leads-by-funnel'] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  // Filter positions: sellers only see leads assigned to them or unassigned
  const visiblePositions = useMemo(() => {
    if (!isSeller || !currentUserId) return positions;
    return positions.filter(p => !p.lead.assigned_to || p.lead.assigned_to === currentUserId);
  }, [positions, isSeller, currentUserId]);
  const [search, setSearch] = useState('');
  const storageKey = `kanban-sort-${funnelId}`;
  const [sortMode, setSortMode] = useState<SortMode>(() => {
    const saved = localStorage.getItem(`kanban-sort-${funnelId}`);
    return (saved && SORT_CYCLE.includes(saved as SortMode)) ? saved as SortMode : 'recontact';
  });

  useEffect(() => {
    localStorage.setItem(storageKey, sortMode);
  }, [storageKey, sortMode]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);
  const [visibleCounts, setVisibleCounts] = useState<Record<string, number>>({});
  const [filters, setFilters] = useState<KanbanFilters>(EMPTY_FILTERS);

  const moveLeadStage = useMoveLeadStage();
  const { data: purchaseMap } = useBulkLeadPurchases(visiblePositions);
  const { data: purchaseProductsMap } = useBulkLeadPurchaseProducts(funnelId, visiblePositions);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  );

  const sortedStages = useMemo(() => [...stages].sort((a, b) => a.sort_order - b.sort_order), [stages]);

  const filteredPositions = useMemo(() => {
    if (!search.trim()) return visiblePositions;
    const q = search.toLowerCase().trim();
    return visiblePositions.filter(p => {
      const lead = p.lead;
      return (
        lead.name?.toLowerCase().includes(q) ||
        lead.email?.toLowerCase().includes(q) ||
        lead.phone?.includes(q)
      );
    });
  }, [visiblePositions, search]);

  const getPurchaseSummary = useCallback((leadId: string): PurchaseSummary | undefined => {
    return purchaseMap?.get(leadId);
  }, [purchaseMap]);

  // Memoize sorted leads per stage
  const sortedLeadsByStage = useMemo(() => {
    const map = new Map<string, (LeadStagePosition & { lead: Lead })[]>();
    
    // Group by stage
    const grouped = new Map<string, (LeadStagePosition & { lead: Lead })[]>();
    for (const p of filteredPositions) {
      const arr = grouped.get(p.stage_id) || [];
      arr.push(p);
      grouped.set(p.stage_id, arr);
    }

    for (const [stageId, stageLeads] of grouped) {
      const sorted = [...stageLeads].sort((a, b) => {
        switch (sortMode) {
          case 'recent':
            return new Date(b.entered_at).getTime() - new Date(a.entered_at).getTime();
          case 'value':
            return (Number(b.lead.metadata?.amount) || 0) - (Number(a.lead.metadata?.amount) || 0);
          case 'orders': {
            const ordersA = purchaseMap?.get(a.lead_id)?.totalOrders || 0;
            const ordersB = purchaseMap?.get(b.lead_id)?.totalOrders || 0;
            return ordersB - ordersA;
          }
          case 'ltv': {
            const ltvA = purchaseMap?.get(a.lead_id)?.totalSpent || 0;
            const ltvB = purchaseMap?.get(b.lead_id)?.totalSpent || 0;
            return ltvB - ltvA;
          }
          case 'recontact': {
            const rA = recontactMap?.get(a.lead_id)?.daysRemaining ?? 9999;
            const rB = recontactMap?.get(b.lead_id)?.daysRemaining ?? 9999;
            return rA - rB; // most urgent first
          }
          default:
            return 0;
        }
      });
      map.set(stageId, sorted);
    }
    return map;
  }, [filteredPositions, sortMode, purchaseMap, recontactMap]);

  const getStageRevenue = (leads: (LeadStagePosition & { lead: Lead })[]) => {
    return leads.reduce((sum, p) => sum + extractMetadataAmount(p.lead.metadata), 0);
  };

  // Build a map: stageId -> classification from transition rules (with name-based fallback)
  const stageClassificationMap = useMemo(() => {
    const map = new Map<string, ValueClassification>();
    for (const rule of transitionRules) {
      if (rule.to_stage_id) {
        const cls = rule.value_classification || getDefaultClassification(rule.event_name);
        const existing = map.get(rule.to_stage_id);
        if (!existing || (cls === 'negative') || (cls === 'pending' && existing === 'positive')) {
          map.set(rule.to_stage_id, cls);
        }
      }
    }

    // Fallback: infer classification from stage name when no rules configured
    for (const stage of stages) {
      if (map.has(stage.id)) continue;
      const name = stage.name.toLowerCase();
      if (/pix|boleto|aguardando/i.test(name)) {
        map.set(stage.id, 'pending');
      } else if (/abandonad|recusad|reembolso|chargeback|cancelad|rejeitad/i.test(name)) {
        map.set(stage.id, 'negative');
      } else if (isRevenueStage(stage.name)) {
        map.set(stage.id, 'positive');
      }
    }

    return map;
  }, [transitionRules, stages]);

  const { confirmedRevenue, lostRevenue, pendingRevenue } = useMemo(() => {
    let confirmed = 0;
    let lost = 0;
    let pending = 0;
    for (const p of visiblePositions) {
      const amount = extractMetadataAmount(p.lead.metadata);
      const cls = stageClassificationMap.get(p.stage_id);
      if (cls === 'positive' || (!cls && isRevenueStage(stages.find(s => s.id === p.stage_id)?.name || ''))) {
        confirmed += amount;
      } else if (cls === 'pending') {
        pending += amount;
      } else {
        lost += amount;
      }
    }
    return { confirmedRevenue: confirmed, lostRevenue: lost, pendingRevenue: pending };
  }, [visiblePositions, stages, stageClassificationMap]);

  const activePosition = activeId ? visiblePositions.find(p => p.id === activeId) : null;

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id as string);
  };

  const handleDragOver = (event: any) => {
    setOverId(event.over?.id as string | null);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    setActiveId(null);
    setOverId(null);

    const { active, over } = event;
    if (!over) return;

    const positionId = active.id as string;
    const toStageId = over.id as string;

    const position = visiblePositions.find(p => p.id === positionId);
    if (!position || position.stage_id === toStageId) return;

    const toStage = stages.find(s => s.id === toStageId);

    moveLeadStage.mutate({
      positionId,
      leadId: position.lead_id,
      funnelId,
      fromStageId: position.stage_id,
      toStageId,
      toStageName: toStage?.name,
    });
  };

  const cycleSortMode = () => {
    setSortMode(current => {
      const idx = SORT_CYCLE.indexOf(current);
      return SORT_CYCLE[(idx + 1) % SORT_CYCLE.length];
    });
  };

  const showMore = (stageId: string) => {
    setVisibleCounts(prev => ({
      ...prev,
      [stageId]: (prev[stageId] || CARDS_PER_PAGE) + CARDS_PER_PAGE,
    }));
  };

  const totalFiltered = filteredPositions.length;
  const totalAll = visiblePositions.length;

  return (
    <div className="space-y-3">
      {/* Search & Controls */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por nome, email ou telefone..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-9 h-9"
          />
        </div>
        <Button
          variant="outline"
          size="sm"
          className="gap-1.5 text-xs"
          onClick={cycleSortMode}
        >
          <ArrowUpDown className="h-3.5 w-3.5" />
          {SORT_LABELS[sortMode]}
        </Button>
        {onBulkMoveOverdue && hasAutoMoveProducts && (
          <Button
            variant="outline"
            size="sm"
            onClick={onBulkMoveOverdue}
            disabled={bulkMoving}
            className="gap-1.5 text-xs"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${bulkMoving ? 'animate-spin' : ''}`} />
            Atualizar Funil
          </Button>
        )}
        <span className="text-xs text-muted-foreground">
          {totalFiltered === totalAll
            ? `${totalAll} leads`
            : `${totalFiltered} de ${totalAll} leads`}
        </span>
        {isAdmin && confirmedRevenue > 0 && (
          <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded">
            <DollarSign className="h-3 w-3" />
            {formatCurrency(confirmedRevenue)}
          </span>
        )}
        {isAdmin && pendingRevenue > 0 && (
          <span className="inline-flex items-center gap-1 text-xs font-semibold text-yellow-600 dark:text-yellow-400 bg-yellow-500/10 px-2 py-0.5 rounded">
            <Hourglass className="h-3 w-3" />
            {formatCurrency(pendingRevenue)}
          </span>
        )}
        {isAdmin && lostRevenue > 0 && (
          <span className="inline-flex items-center gap-1 text-xs font-semibold text-destructive bg-destructive/10 px-2 py-0.5 rounded">
            <AlertTriangle className="h-3 w-3" />
            {formatCurrency(lostRevenue)}
          </span>
        )}
      </div>

      {/* Kanban Columns */}
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragEnd={handleDragEnd}
      >
        <div className="flex gap-4 overflow-x-auto pb-4">
          {sortedStages.map(stage => {
            const stageLeads = sortedLeadsByStage.get(stage.id) || [];
            const visibleCount = visibleCounts[stage.id] || CARDS_PER_PAGE;
            const visibleLeads = stageLeads.slice(0, visibleCount);
            const hasMore = stageLeads.length > visibleCount;
            const shouldHideValues = !isAdmin && stage.hide_values;
            return (
              <div
                key={stage.id}
                className="flex-shrink-0 w-72 bg-muted/50 rounded-xl border border-border"
              >
                <div className="p-3 border-b border-border">
                  <div className="flex items-center gap-2">
                    <span
                      className="h-3 w-3 rounded-full shrink-0"
                      style={{ backgroundColor: stage.color }}
                    />
                    <h3 className="font-semibold text-sm text-foreground flex-1 truncate">
                      {stage.name}
                    </h3>
                    <span className="text-xs text-muted-foreground bg-background rounded-full px-2 py-0.5">
                      {stageLeads.length}
                    </span>
                  </div>
                  {!shouldHideValues && (() => {
                    const rev = getStageRevenue(stageLeads);
                    if (rev <= 0) return null;
                    const cls = stageClassificationMap.get(stage.id);
                    const isPositive = cls === 'positive' || (!cls && isRevenueStage(stage.name));
                    const isPending = cls === 'pending';
                    const colorCls = isPositive
                      ? 'text-emerald-600 dark:text-emerald-400'
                      : isPending
                      ? 'text-yellow-600 dark:text-yellow-400'
                      : 'text-destructive';
                    const label = isPositive ? '' : isPending ? 'pendente' : 'recuperar';
                    return (
                      <p className={`text-xs font-medium mt-1 ${colorCls}`}>
                        {formatCurrency(rev)}
                        {label && <span className="text-[10px] ml-1 opacity-70">{label}</span>}
                      </p>
                    );
                  })()}
                </div>

                <DroppableColumn id={stage.id} isOver={overId === stage.id}>
                  {stageLeads.length === 0 ? (
                    <p className="text-xs text-muted-foreground text-center py-8">
                      {search ? 'Nenhum resultado' : 'Nenhum lead nesta etapa'}
                    </p>
                  ) : (
                    <>
                      {visibleLeads.map(pos => (
                        <LeadCard
                          key={pos.id}
                          position={pos}
                          isDragging={activeId === pos.id}
                          isRevenue={isRevenueStage(stage.name)}
                          purchaseSummary={getPurchaseSummary(pos.lead_id)}
                          recontactInfo={recontactMap?.get(pos.lead_id)}
                          onClick={() => onLeadClick?.(pos.lead_id)}
                          onWhatsAppClick={onWhatsAppClick}
                          hideValues={shouldHideValues}
                          stageClassification={stageClassificationMap.get(stage.id) || null}
                          userRole={userRole}
                          currentUserId={currentUserId}
                          stages={sortedStages}
                        />
                      ))}
                      {hasMore && (
                        <button
                          onClick={() => showMore(stage.id)}
                          className="w-full py-2 text-xs text-muted-foreground hover:text-foreground hover:bg-muted/80 rounded-lg transition-colors flex items-center justify-center gap-1"
                        >
                          <ChevronDown className="h-3.5 w-3.5" />
                          Mostrar mais {Math.min(CARDS_PER_PAGE, stageLeads.length - visibleCount)} de {stageLeads.length - visibleCount} restantes
                        </button>
                      )}
                    </>
                  )}
                </DroppableColumn>
              </div>
            );
          })}

          {sortedStages.length === 0 && (
            <div className="flex-1 flex items-center justify-center py-20 text-muted-foreground">
              <p>Adicione etapas na aba Configuração para ver o Kanban</p>
            </div>
          )}
        </div>

        <DragOverlay>
          {activePosition && (
            <div className="opacity-90 rotate-2 scale-105">
              <LeadCard position={activePosition} purchaseSummary={getPurchaseSummary(activePosition.lead_id)} recontactInfo={recontactMap?.get(activePosition.lead_id)} />
            </div>
          )}
        </DragOverlay>
      </DndContext>
    </div>
  );
};

export default KanbanBoard;
