import React from 'react';
import { Handle, Position } from '@xyflow/react';
import { Columns3, StickyNote } from 'lucide-react';
import { cn } from '@/lib/utils';
import WzNodeToolbar from './WzNodeToolbar';

interface WzMoveStageNodeData {
  label: string;
  funnelId?: string;
  funnelName?: string;
  stageId?: string;
  stageName?: string;
  registerEvent?: boolean;
  notes?: string;
  disabled?: boolean;
  [key: string]: unknown;
}

function WzMoveStageNode({ data, selected }: { data: WzMoveStageNodeData; selected?: boolean }) {
  const hasNotes = !!data.notes?.trim();
  const isDisabled = !!data.disabled;
  const stageLabel = data.stageName || 'Selecionar coluna...';

  return (
    <div
      className={cn(
        'rounded-xl shadow-md min-w-[200px] overflow-hidden transition-shadow relative',
        selected && 'shadow-lg ring-2 ring-orange-400/40',
        isDisabled && 'opacity-40 grayscale'
      )}
    >
      <Handle
        type="target"
        position={Position.Top}
        className="!bg-orange-500 !border-2 !border-white !w-3.5 !h-3.5"
      />

      <WzNodeToolbar
        visible={!!selected}
        disabled={isDisabled}
        onToggleDisable={data._onToggleDisable as (() => void) | undefined}
        onDuplicate={data._onDuplicate as (() => void) | undefined}
      />

      {hasNotes && (
        <div className="absolute -top-2 -right-2 z-10 bg-amber-400 rounded-full p-1 shadow-sm" title={data.notes}>
          <StickyNote className="h-3 w-3 text-amber-900" />
        </div>
      )}

      <div className="bg-gradient-to-r from-orange-500 to-amber-500 px-4 py-3 flex items-center gap-2 text-white">
        <Columns3 className="h-4 w-4" />
        <div>
          <span className="text-[10px] font-bold uppercase tracking-wider opacity-80">Mover para coluna</span>
          <p className="text-sm font-semibold leading-tight">{data.label || 'Mover lead'}</p>
        </div>
      </div>

      <div className="bg-card px-4 py-2.5 border-t border-border space-y-1">
        {data.funnelName && (
          <p className="text-[10px] text-muted-foreground">Funil: {data.funnelName}</p>
        )}
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-orange-500 flex-shrink-0" />
          <span className="text-xs text-foreground truncate">{stageLabel}</span>
        </div>
      </div>

      <Handle
        type="source"
        position={Position.Bottom}
        className="!bg-orange-500 !border-2 !border-white !w-3.5 !h-3.5"
      />
    </div>
  );
}

export default WzMoveStageNode;
