import React from 'react';
import { BaseEdge, EdgeLabelRenderer, getBezierPath, type EdgeProps } from '@xyflow/react';

interface ConversionEdgeData {
  count?: number;
  conversionRate?: number;
}

function ConversionEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  data,
  style,
  markerEnd,
}: EdgeProps) {
  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });

  const edgeData = (data || {}) as ConversionEdgeData;
  const hasMetrics = edgeData.count !== undefined && edgeData.count > 0;

  return (
    <>
      <BaseEdge
        path={edgePath}
        markerEnd={markerEnd}
        style={{
          ...style,
          strokeWidth: hasMetrics ? 2.5 : 1.5,
          stroke: 'hsl(var(--primary))',
          strokeDasharray: hasMetrics ? undefined : '5 5',
        }}
      />
      {hasMetrics && (
        <EdgeLabelRenderer>
          <div
            style={{
              position: 'absolute',
              transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
              pointerEvents: 'all',
            }}
            className="bg-card border border-border rounded-full px-2.5 py-0.5 shadow-sm flex items-center gap-1.5 text-[11px]"
          >
            <span className="font-bold text-foreground">{edgeData.count}</span>
            {edgeData.conversionRate !== undefined && (
              <span className="text-muted-foreground">
                ({edgeData.conversionRate.toFixed(1)}%)
              </span>
            )}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
}

export default ConversionEdge;
