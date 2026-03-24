import React from 'react';
import { Handle, Position } from '@xyflow/react';
import { Clock, StickyNote } from 'lucide-react';
import { cn } from '@/lib/utils';

interface WzTimerNodeData {
  label: string;
  delay?: number;
  unit?: 'minutes' | 'hours' | 'days';
  notes?: string;
  [key: string]: unknown;
}

const unitLabels: Record<string, string> = {
  minutes: 'minutos',
  hours: 'horas',
  days: 'dias',
};

function WzTimerNode({ data, selected }: { data: WzTimerNodeData; selected?: boolean }) {
  const hasNotes = !!data.notes?.trim();
  const delayText = data.delay
    ? `${data.delay} ${unitLabels[data.unit || 'minutes'] || data.unit}`
    : 'Configurar...';

  return (
    <div
      className={cn(
        'rounded-xl shadow-md min-w-[180px] overflow-hidden transition-shadow relative',
        selected && 'shadow-lg ring-2 ring-blue-400/40'
      )}
    >
      <Handle
        type="target"
        position={Position.Top}
        className="!bg-blue-500 !border-2 !border-white !w-3.5 !h-3.5"
      />

      {hasNotes && (
        <div className="absolute -top-2 -right-2 z-10 bg-amber-400 rounded-full p-1 shadow-sm" title={data.notes}>
          <StickyNote className="h-3 w-3 text-amber-900" />
        </div>
      )}

      <div className="bg-gradient-to-r from-blue-600 to-blue-500 px-4 py-3 flex items-center gap-2 text-white">
        <Clock className="h-4 w-4" />
        <div>
          <span className="text-[10px] font-bold uppercase tracking-wider opacity-80">Ação</span>
          <p className="text-sm font-semibold leading-tight">{data.label || 'Aguardar'}</p>
        </div>
      </div>

      <div className="bg-card px-4 py-2.5 border-t border-border">
        <span className="text-xs text-foreground">{delayText}</span>
      </div>

      <Handle
        type="source"
        position={Position.Bottom}
        className="!bg-blue-500 !border-2 !border-white !w-3.5 !h-3.5"
      />
    </div>
  );
}

export default WzTimerNode;
