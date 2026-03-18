import React, { useState, useMemo } from 'react';
import { LeadFunnelStage, Lead, LeadStagePosition } from '@/types/leadFunnels';
import LeadCard from './LeadCard';
import { Search, ArrowUpDown, DollarSign } from 'lucide-react';
import { formatCurrency } from '@/lib/formatters';
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

interface KanbanBoardProps {
  stages: LeadFunnelStage[];
  positions: (LeadStagePosition & { lead: Lead })[];
  onLeadClick?: (leadId: string) => void;
  funnelId: string;
}

type SortMode = 'recent' | 'value';

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

const KanbanBoard: React.FC<KanbanBoardProps> = ({ stages, positions, onLeadClick, funnelId }) => {
  const [search, setSearch] = useState('');
  const [sortMode, setSortMode] = useState<SortMode>('recent');
  const [activeId, setActiveId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);

  const moveLeadStage = useMoveLeadStage();

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  );

  const sortedStages = [...stages].sort((a, b) => a.sort_order - b.sort_order);

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

  const getLeadsForStage = (stageId: string) => {
    const stageLeads = filteredPositions.filter(p => p.stage_id === stageId);
    if (sortMode === 'recent') {
      return stageLeads.sort((a, b) => new Date(b.entered_at).getTime() - new Date(a.entered_at).getTime());
    }
    return stageLeads;
  };

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
          onClick={() => setSortMode(s => s === 'recent' ? 'value' : 'recent')}
        >
          <ArrowUpDown className="h-3.5 w-3.5" />
          {sortMode === 'recent' ? 'Mais recentes' : 'Maior valor'}
        </Button>
        <span className="text-xs text-muted-foreground">
          {totalFiltered === totalAll
            ? `${totalAll} leads`
            : `${totalFiltered} de ${totalAll} leads`}
        </span>
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
            const stageLeads = getLeadsForStage(stage.id);
            return (
              <div
                key={stage.id}
                className="flex-shrink-0 w-72 bg-muted/50 rounded-xl border border-border"
              >
                <div className="p-3 border-b border-border flex items-center gap-2">
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

                <DroppableColumn id={stage.id} isOver={overId === stage.id}>
                  {stageLeads.length === 0 ? (
                    <p className="text-xs text-muted-foreground text-center py-8">
                      {search ? 'Nenhum resultado' : 'Nenhum lead nesta etapa'}
                    </p>
                  ) : (
                    stageLeads.map(pos => (
                      <LeadCard
                        key={pos.id}
                        position={pos}
                        isDragging={activeId === pos.id}
                        onClick={() => onLeadClick?.(pos.lead_id)}
                      />
                    ))
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
              <LeadCard position={activePosition} />
            </div>
          )}
        </DragOverlay>
      </DndContext>
    </div>
  );
};

export default KanbanBoard;
