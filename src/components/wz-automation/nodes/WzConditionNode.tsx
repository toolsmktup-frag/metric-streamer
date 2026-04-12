import React from 'react';
import { Handle, Position } from '@xyflow/react';
import { GitBranch, StickyNote } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { WzNodeStats } from '@/hooks/useWzFlowNodeStats';
import WzNodeToolbar from './WzNodeToolbar';

interface WzConditionNodeData {
  label: string;
  variable?: string;
  operator?: string;
  compareValue?: string;
  notes?: string;
  stats?: WzNodeStats;
  [key: string]: unknown;
}

const operatorLabels: Record<string, string> = {
  equals: '=',
  contains: 'contém',
  greater_than: '>',
  less_than: '<',
  not_equals: '≠',
};

function WzConditionNode({ data, selected }: { data: WzConditionNodeData; selected?: boolean }) {
  const hasNotes = !!data.notes?.trim();
  const isDisabled = !!data.disabled;
  const ruleText = data.variable && data.operator && data.compareValue
    ? `${data.variable} ${operatorLabels[data.operator] || data.operator} ${data.compareValue}`
    : 'Configurar regra...';
  const stats = data.stats;

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

      <WzNodeToolbar visible={!!selected} disabled={isDisabled} onToggleDisable={data._onToggleDisable} onDuplicate={data._onDuplicate} />

      {hasNotes && (
        <div className="absolute -top-2 -right-2 z-10 bg-amber-400 rounded-full p-1 shadow-sm" title={data.notes}>
          <StickyNote className="h-3 w-3 text-amber-900" />
        </div>
      )}

      <div className="bg-gradient-to-r from-orange-500 to-amber-500 px-4 py-3 flex items-center gap-2 text-white">
        <GitBranch className="h-4 w-4" />
        <div>
          <span className="text-[10px] font-bold uppercase tracking-wider opacity-80">Condição</span>
          <p className="text-sm font-semibold leading-tight">{data.label || 'Se / Senão'}</p>
        </div>
      </div>

      <div className="bg-card px-4 py-2.5 border-t border-border">
        <span className="text-xs text-foreground">{ruleText}</span>
      </div>

      {/* Metrics bar */}
      {stats && stats.total > 0 && (
        <div className="bg-muted/50 px-4 py-1.5 border-t border-border flex items-center gap-3">
          <div className="flex items-center gap-1">
            <span className="font-mono text-[10px] text-muted-foreground font-semibold">{stats.total}</span>
            <span className="text-[9px] text-muted-foreground">Avaliado</span>
          </div>
          <div className="flex items-center gap-1">
            <span className="font-mono text-[10px] text-emerald-600 font-semibold">{stats.success}</span>
            <span className="text-[9px] text-emerald-600">SIM</span>
          </div>
          <div className="flex items-center gap-1">
            <span className="font-mono text-[10px] text-destructive font-semibold">{stats.failed}</span>
            <span className="text-[9px] text-destructive">NÃO</span>
          </div>
        </div>
      )}

      {/* Two output handles: SIM (left) and NÃO (right) */}
      <div className="relative h-5">
        <Handle
          type="source"
          position={Position.Bottom}
          id="yes"
          className="!bg-emerald-500 !border-2 !border-white !w-3.5 !h-3.5"
          style={{ left: '30%' }}
        />
        <span className="absolute text-[9px] font-bold text-emerald-600" style={{ left: '30%', bottom: '-14px', transform: 'translateX(-50%)' }}>
          SIM
        </span>
        <Handle
          type="source"
          position={Position.Bottom}
          id="no"
          className="!bg-red-500 !border-2 !border-white !w-3.5 !h-3.5"
          style={{ left: '70%' }}
        />
        <span className="absolute text-[9px] font-bold text-red-500" style={{ left: '70%', bottom: '-14px', transform: 'translateX(-50%)' }}>
          NÃO
        </span>
      </div>
    </div>
  );
}

export default WzConditionNode;
