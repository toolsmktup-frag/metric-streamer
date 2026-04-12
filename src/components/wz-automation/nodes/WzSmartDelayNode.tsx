import React from 'react';
import { Handle, Position } from '@xyflow/react';
import { CalendarClock, StickyNote } from 'lucide-react';
import { cn } from '@/lib/utils';

interface WzSmartDelayNodeData {
  label: string;
  targetTime?: string;
  targetDay?: string;
  businessDaysOnly?: boolean;
  notes?: string;
  [key: string]: unknown;
}

const dayLabels: Record<string, string> = {
  any: 'Qualquer dia',
  monday: 'Segunda',
  tuesday: 'Terça',
  wednesday: 'Quarta',
  thursday: 'Quinta',
  friday: 'Sexta',
  next_business: 'Próx. dia útil',
};

function WzSmartDelayNode({ data, selected }: { data: WzSmartDelayNodeData; selected?: boolean }) {
  const hasNotes = !!data.notes?.trim();
  const timeText = data.targetTime || '09:00';
  const dayText = dayLabels[data.targetDay || 'any'] || data.targetDay;
  const summary = data.targetDay ? `${dayText} às ${timeText}` : `Às ${timeText}`;

  return (
    <div
      className={cn(
        'rounded-xl shadow-md min-w-[190px] overflow-hidden transition-shadow relative',
        selected && 'shadow-lg ring-2 ring-teal-400/40'
      )}
    >
      <Handle
        type="target"
        position={Position.Top}
        className="!bg-teal-500 !border-2 !border-white !w-3.5 !h-3.5"
      />

      {hasNotes && (
        <div className="absolute -top-2 -right-2 z-10 bg-amber-400 rounded-full p-1 shadow-sm" title={data.notes}>
          <StickyNote className="h-3 w-3 text-amber-900" />
        </div>
      )}

      <div className="bg-gradient-to-r from-teal-600 to-teal-500 px-4 py-3 flex items-center gap-2 text-white">
        <CalendarClock className="h-4 w-4" />
        <div>
          <span className="text-[10px] font-bold uppercase tracking-wider opacity-80">Delay</span>
          <p className="text-sm font-semibold leading-tight">{data.label || 'Delay Inteligente'}</p>
        </div>
      </div>

      <div className="bg-card px-4 py-2.5 border-t border-border">
        <span className="text-xs text-foreground">{summary}</span>
        {data.businessDaysOnly && (
          <span className="ml-1.5 text-[10px] text-teal-600 font-medium">(dias úteis)</span>
        )}
      </div>

      <Handle
        type="source"
        position={Position.Bottom}
        className="!bg-teal-500 !border-2 !border-white !w-3.5 !h-3.5"
      />
    </div>
  );
}

export default WzSmartDelayNode;
