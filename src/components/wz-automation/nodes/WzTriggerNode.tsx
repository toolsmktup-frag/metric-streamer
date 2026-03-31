import React from 'react';
import { Handle, Position } from '@xyflow/react';
import { Zap, StickyNote } from 'lucide-react';
import { cn } from '@/lib/utils';

const triggerLabels: Record<string, string> = {
  purchase_approved: 'Compra aprovada',
  pix_generated: 'PIX/Boleto gerado',
  boleto_generated: 'Boleto gerado',
  pix_expired: 'PIX expirado',
  payment_refused: 'Pagamento recusado',
  refund: 'Reembolso',
  cancellation: 'Cancelamento',
  cart_abandoned: 'Abandono de carrinho',
  any_event: 'Qualquer evento',
};

interface WzTriggerNodeData {
  label: string;
  triggerType?: string;
  events?: string[];
  platform?: string;
  productIdFilter?: string;
  notes?: string;
  [key: string]: unknown;
}

function WzTriggerNode({ data, selected }: { data: WzTriggerNodeData; selected?: boolean }) {
  const hasNotes = !!data.notes?.trim();
  const eventLabel = data.triggerType ? (triggerLabels[data.triggerType] || data.triggerType) : 'Configurar...';

  return (
    <div
      className={cn(
        'rounded-xl shadow-md min-w-[200px] overflow-hidden transition-shadow relative',
        selected && 'shadow-lg ring-2 ring-pink-400/40'
      )}
    >
      {hasNotes && (
        <div className="absolute -top-2 -right-2 z-10 bg-amber-400 rounded-full p-1 shadow-sm" title={data.notes}>
          <StickyNote className="h-3 w-3 text-amber-900" />
        </div>
      )}

      {/* Gradient header */}
      <div className="bg-gradient-to-r from-pink-500 to-rose-500 px-4 py-3 flex items-center gap-2 text-white">
        <Zap className="h-4 w-4" />
        <div>
          <span className="text-[10px] font-bold uppercase tracking-wider opacity-80">Gatilho</span>
          <p className="text-sm font-semibold leading-tight">{data.label || 'Gatilho'}</p>
        </div>
      </div>

      {/* Body */}
      <div className="bg-card px-4 py-2.5 border-t border-border">
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-pink-500 flex-shrink-0" />
          <span className="text-xs text-foreground">{eventLabel}</span>
        </div>
        {data.platform && data.platform !== 'any' && (
          <span className="text-[10px] text-muted-foreground mt-1 block">
            Plataforma: {data.platform}
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

export default WzTriggerNode;
export { triggerLabels };
