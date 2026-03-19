import React, { useState, useMemo, useCallback } from 'react';
import { LeadFunnelStage, Lead, LeadStagePosition } from '@/types/leadFunnels';
import LeadCard from './LeadCard';
import { Search, ArrowUpDown, DollarSign, TrendingDown, ChevronDown } from 'lucide-react';
import { formatCurrency } from '@/lib/formatters';
import { isRevenueStage } from '@/lib/revenueStage';
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

const CARDS_PER_PAGE = 50;

interface KanbanBoardProps {
  stages: LeadFunnelStage[];
  positions: (LeadStagePosition & { lead: Lead })[];
  onLeadClick?: (leadId: string) => void;
  onWhatsAppClick?: (phone: string) => void;
  funnelId: string;
}

type SortMode = 'recent' | 'value' | 'orders' | 'ltv';

const SORT_LABELS: Record<SortMode, string> = {
  recent: 'Mais recentes',
  value: 'Maior valor',
  orders: 'Mais compras',
  ltv: 'Maior LTV',
};

const SORT_CYCLE: SortMode[] = ['recent', 'value', 'orders', 'ltv'];

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

const KanbanBoard: React.FC<KanbanBoardProps> = ({ stages, positions, onLeadClick, onWhatsAppClick, funnelId }) => {
  const [search, setSearch] = useState('');
  const [sortMode, setSortMode] = useState<SortMode>('recent');
  const [activeId, setActiveId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);
  const [visibleCounts, setVisibleCounts] = useState<Record<string, number>>({});

  const moveLeadStage = useMoveLeadStage();
  const { data: purchaseMap } = useBulkLeadPurchases(positions);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  );

  const sortedStages = useMemo(() => [...stages].sort((a, b) => a.sort_order - b.sort_order), [stages]);

  const filteredPositions = useMemo(() => {
    if (!search.trim()) return positions;
    const q = search.toLowerCase().trim();
    return positions.filter(p => {
      const lead = p.lead;
      return (
        lead.name?.toLowerCase().includes(q) ||
        lead.email?.toLowerCase().includes(q) ||
        lead.phone?.includes(q)
      );
    });
  }, [positions, search]);

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
          default:
            return 0;
        }
      });
      map.set(stageId, sorted);
    }
    return map;
  }, [filteredPositions, sortMode, purchaseMap]);

  const getStageRevenue = (leads: (LeadStagePosition & { lead: Lead })[]) => {
    return leads.reduce((sum, p) => sum + (Number(p.lead.metadata?.amount) || 0), 0);
  };

  const { confirmedRevenue, lostRevenue } = useMemo(() => {
    let confirmed = 0;
    let lost = 0;
    const stageMap = new Map(stages.map(s => [s.id, s]));
    for (const p of positions) {
      const amount = Number(p.lead.metadata?.amount) || 0;
      const stage = stageMap.get(p.stage_id);
      if (stage && isRevenueStage(stage.name)) {
        confirmed += amount;
      } else {
        lost += amount;
      }
    }
    return { confirmedRevenue: confirmed, lostRevenue: lost };
  }, [positions, stages]);

  const activePosition = activeId ? positions.find(p => p.id === activeId) : null;

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

    const position = positions.find(p => p.id === positionId);
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
  const totalAll = positions.length;

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
        <span className="text-xs text-muted-foreground">
          {totalFiltered === totalAll
            ? `${totalAll} leads`
            : `${totalFiltered} de ${totalAll} leads`}
        </span>
        {confirmedRevenue > 0 && (
          <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded">
            <DollarSign className="h-3 w-3" />
            {formatCurrency(confirmedRevenue)}
          </span>
        )}
        {lostRevenue > 0 && (
          <span className="inline-flex items-center gap-1 text-xs font-semibold text-destructive bg-destructive/10 px-2 py-0.5 rounded">
            <TrendingDown className="h-3 w-3" />
            -{formatCurrency(lostRevenue)}
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
            const isRevenue = isRevenueStage(stage.name);
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
                  {(() => {
                    const rev = getStageRevenue(stageLeads);
                    return rev > 0 ? (
                      <p className={`text-xs font-medium mt-1 ${isRevenue ? 'text-emerald-600 dark:text-emerald-400' : 'text-destructive'}`}>
                        {isRevenue ? '' : '- '}{formatCurrency(rev)}
                        {!isRevenue && <span className="text-[10px] ml-1 opacity-70">perdido</span>}
                      </p>
                    ) : null;
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
                          isRevenue={isRevenue}
                          purchaseSummary={getPurchaseSummary(pos.lead_id)}
                          onClick={() => onLeadClick?.(pos.lead_id)}
                          onWhatsAppClick={onWhatsAppClick}
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
              <LeadCard position={activePosition} purchaseSummary={getPurchaseSummary(activePosition.lead_id)} />
            </div>
          )}
        </DragOverlay>
      </DndContext>
    </div>
  );
};

export default KanbanBoard;
