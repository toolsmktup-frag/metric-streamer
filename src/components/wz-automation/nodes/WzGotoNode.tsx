import React from 'react';
import { Handle, Position } from '@xyflow/react';
import { CornerDownRight, StickyNote } from 'lucide-react';
import { cn } from '@/lib/utils';

interface WzGotoNodeData {
  label: string;
  targetNodeId?: string;
  targetNodeLabel?: string;
  notes?: string;
  [key: string]: unknown;
}

function WzGotoNode({ data, selected }: { data: WzGotoNodeData; selected?: boolean }) {
  const hasNotes = !!data.notes?.trim();
  const isDisabled = !!data.disabled;
  const targetText = data.targetNodeLabel || (data.targetNodeId ? `→ ${data.targetNodeId}` : 'Selecionar destino...');

  return (
    <div
      className={cn(
        'rounded-xl shadow-md min-w-[180px] overflow-hidden transition-shadow relative',
        selected && 'shadow-lg ring-2 ring-cyan-400/40',
        isDisabled && 'opacity-40 grayscale'
      )}
    >
      <Handle
        type="target"
        position={Position.Top}
        className="!bg-cyan-500 !border-2 !border-white !w-3.5 !h-3.5"
      />

      {hasNotes && (
        <div className="absolute -top-2 -right-2 z-10 bg-amber-400 rounded-full p-1 shadow-sm" title={data.notes}>
          <StickyNote className="h-3 w-3 text-amber-900" />
        </div>
      )}

      <div className="bg-gradient-to-r from-cyan-600 to-cyan-500 px-4 py-3 flex items-center gap-2 text-white">
        <CornerDownRight className="h-4 w-4" />
        <div>
          <span className="text-[10px] font-bold uppercase tracking-wider opacity-80">Goto</span>
          <p className="text-sm font-semibold leading-tight">{data.label || 'Pular para'}</p>
        </div>
      </div>

      <div className="bg-card px-4 py-2.5 border-t border-border">
        <span className="text-xs text-foreground">{targetText}</span>
      </div>
    </div>
  );
}

export default WzGotoNode;
