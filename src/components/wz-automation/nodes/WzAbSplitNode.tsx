import React from 'react';
import { Handle, Position } from '@xyflow/react';
import { Split, StickyNote } from 'lucide-react';
import { cn } from '@/lib/utils';

interface WzAbSplitNodeData {
  label: string;
  paths?: { label: string; percent: number }[];
  notes?: string;
  [key: string]: unknown;
}

function WzAbSplitNode({ data, selected }: { data: WzAbSplitNodeData; selected?: boolean }) {
  const hasNotes = !!data.notes?.trim();
  const paths = data.paths || [
    { label: 'A', percent: 50 },
    { label: 'B', percent: 50 },
  ];

  const pathColors = ['#8b5cf6', '#06b6d4', '#f97316'];

  return (
    <div
      className={cn(
        'rounded-xl shadow-md min-w-[200px] overflow-hidden transition-shadow relative',
        selected && 'shadow-lg ring-2 ring-violet-400/40'
      )}
    >
      <Handle
        type="target"
        position={Position.Top}
        className="!bg-violet-500 !border-2 !border-white !w-3.5 !h-3.5"
      />

      {hasNotes && (
        <div className="absolute -top-2 -right-2 z-10 bg-amber-400 rounded-full p-1 shadow-sm" title={data.notes}>
          <StickyNote className="h-3 w-3 text-amber-900" />
        </div>
      )}

      <div className="bg-gradient-to-r from-violet-600 to-purple-500 px-4 py-3 flex items-center gap-2 text-white">
        <Split className="h-4 w-4" />
        <div>
          <span className="text-[10px] font-bold uppercase tracking-wider opacity-80">Divisor</span>
          <p className="text-sm font-semibold leading-tight">{data.label || 'Teste A/B'}</p>
        </div>
      </div>

      <div className="bg-card px-4 py-2.5 border-t border-border">
        <div className="flex gap-2">
          {paths.map((p, i) => (
            <span key={i} className="text-xs font-medium" style={{ color: pathColors[i] || '#6b7280' }}>
              {p.label}: {p.percent}%
            </span>
          ))}
        </div>
      </div>

      <div className="relative h-5">
        {paths.map((p, i) => {
          const positions = paths.length === 2 ? [30, 70] : [20, 50, 80];
          return (
            <React.Fragment key={i}>
              <Handle
                type="source"
                position={Position.Bottom}
                id={`path_${i}`}
                className="!border-2 !border-white !w-3.5 !h-3.5"
                style={{ left: `${positions[i]}%`, background: pathColors[i] }}
              />
              <span
                className="absolute text-[9px] font-bold"
                style={{ left: `${positions[i]}%`, bottom: '-14px', transform: 'translateX(-50%)', color: pathColors[i] }}
              >
                {p.label}
              </span>
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
}

export default WzAbSplitNode;
