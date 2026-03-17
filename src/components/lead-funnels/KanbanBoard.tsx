import React from 'react';
import { LeadFunnelStage, Lead, LeadStagePosition } from '@/types/leadFunnels';
import LeadCard from './LeadCard';

interface KanbanBoardProps {
  stages: LeadFunnelStage[];
  positions: (LeadStagePosition & { lead: Lead })[];
  onLeadClick?: (leadId: string) => void;
}

const KanbanBoard: React.FC<KanbanBoardProps> = ({ stages, positions, onLeadClick }) => {
  const sortedStages = [...stages].sort((a, b) => a.sort_order - b.sort_order);

  const getLeadsForStage = (stageId: string) =>
    positions.filter(p => p.stage_id === stageId);

  return (
    <div className="flex gap-4 overflow-x-auto pb-4">
      {sortedStages.map(stage => {
        const stageLeads = getLeadsForStage(stage.id);
        return (
          <div
            key={stage.id}
            className="flex-shrink-0 w-72 bg-muted/50 rounded-xl border border-border"
          >
            {/* Column Header */}
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

            {/* Cards */}
            <div className="p-2 space-y-2 min-h-[200px] max-h-[60vh] overflow-y-auto">
              {stageLeads.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-8">
                  Nenhum lead nesta etapa
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
  );
};

export default KanbanBoard;
