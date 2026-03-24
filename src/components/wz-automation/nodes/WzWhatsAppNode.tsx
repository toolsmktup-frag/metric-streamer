import React from 'react';
import { Handle, Position } from '@xyflow/react';
import { MessageCircle, StickyNote } from 'lucide-react';
import { cn } from '@/lib/utils';

interface WzWhatsAppNodeData {
  label: string;
  instanceId?: string;
  instanceName?: string;
  messages?: Array<{ text: string; type: string }>;
  delayMin?: number;
  delayMax?: number;
  notes?: string;
  [key: string]: unknown;
}

function WzWhatsAppNode({ data, selected }: { data: WzWhatsAppNodeData; selected?: boolean }) {
  const hasNotes = !!data.notes?.trim();
  const firstMsg = data.messages?.[0]?.text;
  const preview = firstMsg
    ? (firstMsg.length > 40 ? firstMsg.slice(0, 40) + '…' : firstMsg)
    : null;

  return (
    <div
      className={cn(
        'rounded-xl shadow-md min-w-[200px] overflow-hidden transition-shadow relative',
        selected && 'shadow-lg ring-2 ring-emerald-400/40'
      )}
    >
      <Handle
        type="target"
        position={Position.Top}
        className="!bg-emerald-500 !border-2 !border-white !w-3.5 !h-3.5"
      />

      {hasNotes && (
        <div className="absolute -top-2 -right-2 z-10 bg-amber-400 rounded-full p-1 shadow-sm" title={data.notes}>
          <StickyNote className="h-3 w-3 text-amber-900" />
        </div>
      )}

      {/* Header */}
      <div className="bg-gradient-to-r from-emerald-600 to-emerald-500 px-4 py-3 flex items-center gap-2 text-white">
        <MessageCircle className="h-4 w-4" />
        <div>
          <span className="text-[10px] font-bold uppercase tracking-wider opacity-80">Ação</span>
          <p className="text-sm font-semibold leading-tight">{data.label || 'Enviar WhatsApp'}</p>
        </div>
      </div>

      {/* Body */}
      <div className="bg-card px-4 py-2.5 border-t border-border space-y-1">
        <div className="flex items-center gap-2">
          <span className={cn(
            'h-2 w-2 rounded-full flex-shrink-0',
            data.instanceId ? 'bg-emerald-500' : 'bg-muted-foreground'
          )} />
          <span className="text-xs text-foreground">
            {data.instanceName || 'Selecionar instância'}
          </span>
        </div>
        {preview && (
          <p className="text-[11px] text-muted-foreground italic truncate">"{preview}"</p>
        )}
        {data.messages && data.messages.length > 1 && (
          <span className="text-[10px] text-muted-foreground">
            +{data.messages.length - 1} variação{data.messages.length > 2 ? 'ões' : ''}
          </span>
        )}
      </div>

      <Handle
        type="source"
        position={Position.Bottom}
        className="!bg-emerald-500 !border-2 !border-white !w-3.5 !h-3.5"
      />
    </div>
  );
}

export default WzWhatsAppNode;
