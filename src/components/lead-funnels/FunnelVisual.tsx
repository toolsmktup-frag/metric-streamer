import React from 'react';
import { LeadFunnelStage } from '@/types/leadFunnels';

interface FunnelVisualProps {
  stages: LeadFunnelStage[];
  leadCounts: Record<string, number>;
  historicalCounts?: Record<string, number>;
}

const FunnelVisual: React.FC<FunnelVisualProps> = ({ stages, leadCounts, historicalCounts = {} }) => {
  const sorted = [...stages].sort((a, b) => a.sort_order - b.sort_order);
  const maxCount = Math.max(1, ...sorted.map(s => historicalCounts[s.id] || leadCounts[s.id] || 0));

  return (
    <div className="flex flex-col items-center gap-1 py-6">
      {sorted.map((stage, i) => {
        const currentCount = leadCounts[stage.id] || 0;
        const historicalCount = historicalCounts[stage.id] || currentCount;
        const widthPercent = Math.max(20, (historicalCount / maxCount) * 100);
        const prevCount = i > 0 ? (historicalCounts[sorted[i - 1].id] || leadCounts[sorted[i - 1].id] || 0) : null;
        const convRate = prevCount && prevCount > 0 ? ((historicalCount / prevCount) * 100).toFixed(1) : null;

        return (
          <div key={stage.id} className="w-full flex flex-col items-center">
            <div
              className="rounded-lg py-3 px-4 text-center transition-all relative"
              style={{
                width: `${widthPercent}%`,
                backgroundColor: stage.color + '20',
                borderLeft: `4px solid ${stage.color}`,
              }}
            >
              <p className="text-sm font-semibold text-foreground">{stage.name}</p>
              <div className="mt-1 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                <span>Atual: <strong className="text-foreground">{currentCount}</strong></span>
                <span>Passaram: <strong className="text-foreground">{historicalCount}</strong></span>
              </div>
              {convRate && (
                <span className="absolute -right-16 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
                  {convRate}%
                </span>
              )}
            </div>
            {i < sorted.length - 1 && (
              <div className="w-0.5 h-3 bg-border" />
            )}
          </div>
        );
      })}

      {sorted.length === 0 && (
        <p className="text-muted-foreground text-sm py-10">
          Adicione etapas para visualizar o funil
        </p>
      )}
    </div>
  );
};

export default FunnelVisual;
