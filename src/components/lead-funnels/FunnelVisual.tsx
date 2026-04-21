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
  const stageById = new Map(sorted.map(stage => [stage.id, stage]));
  const hasVisualConfig = sorted.some(stage => !!stage.visual_parent_stage_id);
  const childrenByParent = new Map<string | null, LeadFunnelStage[]>();

  sorted.forEach((stage, i) => {
    const configuredParent = stage.visual_parent_stage_id;
    const parentId = hasVisualConfig
      ? configuredParent && configuredParent !== stage.id && stageById.has(configuredParent) ? configuredParent : null
      : i > 0 ? sorted[i - 1].id : null;
    const children = childrenByParent.get(parentId) || [];
    children.push(stage);
    childrenByParent.set(parentId, children);
  });

  const getStageMetrics = (stage: LeadFunnelStage) => {
    const index = sorted.findIndex(item => item.id === stage.id);
    const currentCount = leadCounts[stage.id] || 0;
    const historicalCount = historicalCounts[stage.id] || currentCount;
    const widthPercent = Math.max(20, (historicalCount / maxCount) * 100);
    const baseStage = stage.conversion_base_stage_id ? stageById.get(stage.conversion_base_stage_id) : sorted[index - 1];
    const baseCount = baseStage ? (historicalCounts[baseStage.id] || leadCounts[baseStage.id] || 0) : null;
    const convRate = baseCount && baseCount > 0 ? ((historicalCount / baseCount) * 100).toFixed(1) : null;

    return { currentCount, historicalCount, widthPercent, baseStage, convRate };
  };

  const renderStage = (stage: LeadFunnelStage, visited = new Set<string>()): React.ReactNode => {
    if (visited.has(stage.id)) return null;
    const nextVisited = new Set(visited);
    nextVisited.add(stage.id);
    const children = childrenByParent.get(stage.id) || [];
    const { currentCount, historicalCount, widthPercent, baseStage, convRate } = getStageMetrics(stage);

    return (
      <div key={stage.id} className="flex min-w-[16rem] flex-col items-center">
        <div
          className="relative rounded-lg px-4 py-3 text-center transition-all"
          style={{
            width: `${widthPercent}%`,
            minWidth: '13rem',
            maxWidth: '18rem',
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
            <span className="mt-2 inline-flex rounded-md bg-background/70 px-2 py-0.5 text-xs font-medium text-muted-foreground" title={baseStage ? `Base: ${baseStage.name}` : undefined}>
              {convRate}%
            </span>
          )}
        </div>

        {children.length > 0 && (
          <>
            <div className="h-4 w-0.5 bg-border" />
            <div className="flex w-full flex-col items-center">
              {children.length > 1 && <div className="h-0.5 w-[calc(100%-16rem)] min-w-24 bg-border" />}
              <div className="flex w-full flex-col items-start justify-center gap-4 pt-4 md:flex-row">
                {children.map(child => renderStage(child, nextVisited))}
              </div>
            </div>
          </>
        )}
      </div>
    );
  };
  const roots = childrenByParent.get(null) || [];

  return (
    <div className="overflow-x-auto py-6">
      <div className="flex min-w-max flex-col items-center gap-6 px-4">
        {roots.map(root => renderStage(root))}
      </div>

      {sorted.length === 0 && (
        <p className="text-muted-foreground text-sm py-10">
          Adicione etapas para visualizar o funil
        </p>
      )}
    </div>
  );
};

export default FunnelVisual;
