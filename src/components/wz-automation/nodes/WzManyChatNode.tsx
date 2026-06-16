import React from 'react';
import { Handle, Position } from '@xyflow/react';
import { UserPlus, StickyNote } from 'lucide-react';
import { cn } from '@/lib/utils';
import WzNodeToolbar from './WzNodeToolbar';

interface WzManyChatNodeData {
  label: string;
  tagName?: string;
  notes?: string;
  [key: string]: unknown;
}

function WzManyChatNode({ data, selected }: { data: WzManyChatNodeData; selected?: boolean }) {
  const hasNotes = !!data.notes?.trim();
  const isDisabled = !!data.disabled;
  const tagText = data.tagName ? `+ ${data.tagName}` : 'Configurar tag...';

  return (
    <div
      className={cn(
        'rounded-xl shadow-md min-w-[190px] overflow-hidden transition-shadow relative',
        selected && 'shadow-lg ring-2 ring-sky-400/40',
        isDisabled && 'opacity-40 grayscale'
      )}
    >
      <Handle
        type="target"
        position={Position.Top}
        className="!bg-sky-500 !border-2 !border-white !w-3.5 !h-3.5"
      />

      <WzNodeToolbar visible={!!selected} disabled={isDisabled} onToggleDisable={data._onToggleDisable} onDuplicate={data._onDuplicate} />

      {hasNotes && (
        <div className="absolute -top-2 -right-2 z-10 bg-amber-400 rounded-full p-1 shadow-sm" title={data.notes}>
          <StickyNote className="h-3 w-3 text-amber-900" />
        </div>
      )}

      <div className="bg-gradient-to-r from-sky-600 to-sky-500 px-4 py-3 flex items-center gap-2 text-white">
        <UserPlus className="h-4 w-4" />
        <div>
          <span className="text-[10px] font-bold uppercase tracking-wider opacity-80">ManyChat</span>
          <p className="text-sm font-semibold leading-tight">{data.label || 'Criar/atualizar + Tag'}</p>
        </div>
      </div>

      <div className="bg-card px-4 py-2.5 border-t border-border">
        <span className="text-xs text-foreground">{tagText}</span>
      </div>

      <Handle
        type="source"
        position={Position.Bottom}
        className="!bg-sky-500 !border-2 !border-white !w-3.5 !h-3.5"
      />
    </div>
  );
}

export default WzManyChatNode;
