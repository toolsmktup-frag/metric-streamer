import React, { useState, useCallback } from 'react';
import { StickyNote } from 'lucide-react';
import { cn } from '@/lib/utils';
import { NodeResizer } from '@xyflow/react';

const noteColors: Record<string, { bg: string; border: string; header: string }> = {
  yellow: { bg: 'bg-amber-50 dark:bg-amber-950/30', border: 'border-amber-300 dark:border-amber-700', header: 'bg-amber-200 dark:bg-amber-800/60' },
  blue: { bg: 'bg-blue-50 dark:bg-blue-950/30', border: 'border-blue-300 dark:border-blue-700', header: 'bg-blue-200 dark:bg-blue-800/60' },
  green: { bg: 'bg-emerald-50 dark:bg-emerald-950/30', border: 'border-emerald-300 dark:border-emerald-700', header: 'bg-emerald-200 dark:bg-emerald-800/60' },
  pink: { bg: 'bg-pink-50 dark:bg-pink-950/30', border: 'border-pink-300 dark:border-pink-700', header: 'bg-pink-200 dark:bg-pink-800/60' },
};

interface WzNoteNodeData {
  label: string;
  text?: string;
  noteColor?: string;
  [key: string]: unknown;
}

function WzNoteNode({ data, selected }: { data: WzNoteNodeData; selected?: boolean }) {
  const color = noteColors[data.noteColor || 'yellow'] || noteColors.yellow;

  return (
    <div
      className={cn(
        'rounded-lg shadow-md border-2 transition-shadow h-full w-full',
        color.bg,
        color.border,
        selected && 'shadow-lg ring-2 ring-amber-400/40'
      )}
      style={{ minHeight: 80, minWidth: 180 }}
    >
      <NodeResizer
        isVisible={!!selected}
        minWidth={180}
        minHeight={80}
        lineClassName="!border-amber-400"
        handleClassName="!bg-amber-400 !border-amber-600 !w-2.5 !h-2.5"
      />
      <div className={cn('px-3 py-1.5 flex items-center gap-1.5 rounded-t-md', color.header)}>
        <StickyNote className="h-3.5 w-3.5 text-foreground/70" />
        <span className="text-xs font-semibold text-foreground/80 truncate">
          {data.label || 'Anotação'}
        </span>
      </div>
      <div className="px-3 py-2 overflow-auto" style={{ height: 'calc(100% - 32px)' }}>
        <p className="text-xs text-foreground/70 whitespace-pre-wrap leading-relaxed">
          {data.text || 'Clique para editar...'}
        </p>
      </div>
    </div>
  );
}

export default WzNoteNode;
