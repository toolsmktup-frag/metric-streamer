import React, { useState, useMemo } from 'react';
import { LeadFunnelStage, Lead, LeadStagePosition } from '@/types/leadFunnels';
import LeadCard from './LeadCard';
import { Search, ArrowUpDown } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

interface KanbanBoardProps {
  stages: LeadFunnelStage[];
  positions: (LeadStagePosition & { lead: Lead })[];
  onLeadClick?: (leadId: string) => void;
}

type SortMode = 'recent' | 'value';

const KanbanBoard: React.FC<KanbanBoardProps> = ({ stages, positions, onLeadClick }) => {
  const [search, setSearch] = useState('');
  const [sortMode, setSortMode] = useState<SortMode>('recent');

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

              <div className="p-2 space-y-2 min-h-[200px] max-h-[60vh] overflow-y-auto">
                {stageLeads.length === 0 ? (
                  <p className="text-xs text-muted-foreground text-center py-8">
                    {search ? 'Nenhum resultado' : 'Nenhum lead nesta etapa'}
                  </p>
                ) : (
                  stageLeads.map(pos => (
                    <LeadCard
                      key={pos.id}
                      position={pos}
                      onClick={() => onLeadClick?.(pos.lead_id)}
                    />
                  ))
                )}
              </div>
            </div>
          );
        })}

        {sortedStages.length === 0 && (
          <div className="flex-1 flex items-center justify-center py-20 text-muted-foreground">
            <p>Adicione etapas na aba Configuração para ver o Kanban</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default KanbanBoard;
