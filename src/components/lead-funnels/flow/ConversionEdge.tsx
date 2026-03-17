import React, { useState, useRef, useEffect } from 'react';
import { BaseEdge, EdgeLabelRenderer, getBezierPath, type EdgeProps } from '@xyflow/react';

interface ConversionEdgeData {
  count?: number;
  conversionRate?: number;
  label?: string;
}

interface ConversionEdgeProps extends EdgeProps {
  onLabelChange?: (edgeId: string, label: string) => void;
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
}: ConversionEdgeProps) {
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

  const [editing, setEditing] = useState(false);
  const [labelValue, setLabelValue] = useState(edgeData.label || '');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setLabelValue(edgeData.label || '');
  }, [edgeData.label]);

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editing]);

  const commitLabel = () => {
    setEditing(false);
    // Dispatch custom event to update edge data in parent
    window.dispatchEvent(new CustomEvent('edge-label-change', { detail: { edgeId: id, label: labelValue } }));
  };

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
      <EdgeLabelRenderer>
        <div
          style={{
            position: 'absolute',
            transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
            pointerEvents: 'all',
          }}
          className="flex flex-col items-center gap-1"
        >
          {/* Editable label */}
          {editing ? (
            <input
              ref={inputRef}
              value={labelValue}
              onChange={(e) => setLabelValue(e.target.value)}
              onBlur={commitLabel}
              onKeyDown={(e) => { if (e.key === 'Enter') commitLabel(); if (e.key === 'Escape') { setLabelValue(edgeData.label || ''); setEditing(false); } }}
              className="bg-card border border-border rounded px-2 py-0.5 text-[11px] text-foreground outline-none ring-1 ring-primary/40 w-24 text-center"
              placeholder="Label..."
            />
          ) : (
            <button
              onClick={() => setEditing(true)}
              className="bg-card/80 border border-border/50 rounded px-2 py-0.5 text-[10px] text-muted-foreground hover:text-foreground hover:border-border transition-colors cursor-text min-w-[40px]"
            >
              {edgeData.label || '+ label'}
            </button>
          )}

          {/* Metrics badge */}
          {hasMetrics && (
            <div className="bg-card border border-border rounded-full px-2.5 py-0.5 shadow-sm flex items-center gap-1.5 text-[11px]">
              <span className="font-bold text-foreground">{edgeData.count}</span>
              {edgeData.conversionRate !== undefined && (
                <span className="text-muted-foreground">
                  ({edgeData.conversionRate.toFixed(1)}%)
                </span>
              )}
            </div>
          )}
        </div>
      </EdgeLabelRenderer>
    </>
  );
}

export default ConversionEdge;
