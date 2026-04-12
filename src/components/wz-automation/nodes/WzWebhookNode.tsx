import React from 'react';
import { Handle, Position } from '@xyflow/react';
import { Globe, StickyNote } from 'lucide-react';
import { cn } from '@/lib/utils';

interface WzWebhookNodeData {
  label: string;
  url?: string;
  method?: 'GET' | 'POST' | 'PUT';
  notes?: string;
  [key: string]: unknown;
}

function WzWebhookNode({ data, selected }: { data: WzWebhookNodeData; selected?: boolean }) {
  const hasNotes = !!data.notes?.trim();
  const isDisabled = !!data.disabled;
  const method = data.method || 'POST';
  const urlPreview = data.url ? (data.url.length > 30 ? data.url.slice(0, 30) + '...' : data.url) : 'Configurar URL...';

  return (
    <div
      className={cn(
        'rounded-xl shadow-md min-w-[200px] overflow-hidden transition-shadow relative',
        selected && 'shadow-lg ring-2 ring-indigo-400/40',
        isDisabled && 'opacity-40 grayscale'
      )}
    >
      <Handle
        type="target"
        position={Position.Top}
        className="!bg-indigo-500 !border-2 !border-white !w-3.5 !h-3.5"
      />

      {hasNotes && (
        <div className="absolute -top-2 -right-2 z-10 bg-amber-400 rounded-full p-1 shadow-sm" title={data.notes}>
          <StickyNote className="h-3 w-3 text-amber-900" />
        </div>
      )}

      <div className="bg-gradient-to-r from-indigo-600 to-indigo-500 px-4 py-3 flex items-center gap-2 text-white">
        <Globe className="h-4 w-4" />
        <div>
          <span className="text-[10px] font-bold uppercase tracking-wider opacity-80">Webhook</span>
          <p className="text-sm font-semibold leading-tight">{data.label || 'Webhook HTTP'}</p>
        </div>
      </div>

      <div className="bg-card px-4 py-2.5 border-t border-border flex items-center gap-2">
        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300">
          {method}
        </span>
        <span className="text-xs text-foreground truncate">{urlPreview}</span>
      </div>

      <Handle
        type="source"
        position={Position.Bottom}
        className="!bg-indigo-500 !border-2 !border-white !w-3.5 !h-3.5"
      />
    </div>
  );
}

export default WzWebhookNode;
