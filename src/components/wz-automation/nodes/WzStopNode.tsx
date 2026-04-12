import React from 'react';
import { Handle, Position } from '@xyflow/react';
import { XCircle, Ban } from 'lucide-react';
import { cn } from '@/lib/utils';
import WzNodeToolbar from './WzNodeToolbar';

interface WzStopNodeData {
  label: string;
  stopType?: 'stop' | 'cancel_previous';
  [key: string]: unknown;
}

function WzStopNode({ data, selected }: { data: WzStopNodeData; selected?: boolean }) {
  const isCancel = data.stopType === 'cancel_previous';
  const isDisabled = !!data.disabled;

  return (
    <div
      className={cn(
        'rounded-xl shadow-md min-w-[160px] overflow-hidden transition-shadow relative',
        selected && 'shadow-lg ring-2 ring-gray-400/40',
        isDisabled && 'opacity-40 grayscale'
      )}
    >
      <WzNodeToolbar visible={!!selected} disabled={isDisabled} onToggleDisable={data._onToggleDisable} onDuplicate={data._onDuplicate} />

      <Handle
        type="target"
        position={Position.Top}
        className="!bg-gray-400 !border-2 !border-white !w-3.5 !h-3.5"
      />

      <div className={cn(
        'px-4 py-3 flex items-center gap-2 text-white',
        isCancel
          ? 'bg-gradient-to-r from-red-400 to-red-300'
          : 'bg-gradient-to-r from-gray-500 to-gray-400'
      )}>
        {isCancel ? <Ban className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
        <div>
          <span className="text-[10px] font-bold uppercase tracking-wider opacity-80">
            {isCancel ? 'Cancelar' : 'Fim'}
          </span>
          <p className="text-sm font-semibold leading-tight">
            {data.label || (isCancel ? 'Cancelar anteriores' : 'Parar Fluxo')}
          </p>
        </div>
      </div>
    </div>
  );
}

export default WzStopNode;
