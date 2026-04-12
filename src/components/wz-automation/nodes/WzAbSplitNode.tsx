import React from 'react';
import { Handle, Position } from '@xyflow/react';
import { Split, StickyNote, Users, Shuffle, Hash, Percent } from 'lucide-react';
import { cn } from '@/lib/utils';
import WzNodeToolbar from './WzNodeToolbar';

export type SplitMode = 'percentage' | 'round_robin' | 'random' | 'fixed_count';

interface SplitPath {
  label: string;
  percent?: number;
  count?: number;
  sellerId?: string;
  sellerName?: string;
}

interface WzAbSplitNodeData {
  label: string;
  splitMode?: SplitMode;
  paths?: SplitPath[];
  sellers?: { id: string; name: string }[];
  assignAction?: 'assign_and_branch' | 'assign_only';
  notes?: string;
  [key: string]: unknown;
}

const MODE_LABELS: Record<SplitMode, string> = {
  percentage: 'Porcentagem',
  round_robin: 'Round-Robin',
  random: 'Aleatório',
  fixed_count: 'Quantidade',
};

const MODE_ICONS: Record<SplitMode, React.ReactNode> = {
  percentage: <Percent className="h-3 w-3" />,
  round_robin: <Users className="h-3 w-3" />,
  random: <Shuffle className="h-3 w-3" />,
  fixed_count: <Hash className="h-3 w-3" />,
};

const MODE_COLORS: Record<SplitMode, string> = {
  percentage: 'from-violet-600 to-purple-500',
  round_robin: 'from-blue-600 to-cyan-500',
  random: 'from-amber-500 to-orange-500',
  fixed_count: 'from-emerald-600 to-teal-500',
};

function WzAbSplitNode({ data, selected }: { data: WzAbSplitNodeData; selected?: boolean }) {
  const hasNotes = !!data.notes?.trim();
  const isDisabled = !!data.disabled;
  const mode: SplitMode = data.splitMode || 'percentage';
  const isSeller = mode === 'round_robin' || mode === 'random';
  const assignOnly = data.assignAction === 'assign_only';

  const paths = data.paths || [
    { label: 'A', percent: 50 },
    { label: 'B', percent: 50 },
  ];

  const sellers = data.sellers || [];
  const pathColors = ['#8b5cf6', '#06b6d4', '#f97316', '#10b981', '#ef4444'];

  // For seller modes with assign_only, single output
  const outputPaths = isSeller && assignOnly ? [{ label: '→' }] : paths;

  return (
    <div
      className={cn(
        'rounded-xl shadow-md min-w-[200px] max-w-[260px] overflow-hidden transition-shadow relative',
        selected && 'shadow-lg ring-2 ring-violet-400/40',
        isDisabled && 'opacity-40 grayscale'
      )}
    >
      <Handle
        type="target"
        position={Position.Top}
        className="!bg-violet-500 !border-2 !border-white !w-3.5 !h-3.5"
      />

      <WzNodeToolbar visible={!!selected} disabled={isDisabled} onToggleDisable={data._onToggleDisable} onDuplicate={data._onDuplicate} />

      {hasNotes && (
        <div className="absolute -top-2 -right-2 z-10 bg-amber-400 rounded-full p-1 shadow-sm" title={data.notes}>
          <StickyNote className="h-3 w-3 text-amber-900" />
        </div>
      )}

      {/* Header */}
      <div className={cn('bg-gradient-to-r px-4 py-3 flex items-center gap-2 text-white', MODE_COLORS[mode])}>
        <Split className="h-4 w-4" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] font-bold uppercase tracking-wider opacity-80">Divisor</span>
            <span className="inline-flex items-center gap-1 text-[9px] bg-white/20 rounded-full px-1.5 py-0.5">
              {MODE_ICONS[mode]}
              {MODE_LABELS[mode]}
            </span>
          </div>
          <p className="text-sm font-semibold leading-tight truncate">{data.label || 'Divisor'}</p>
        </div>
      </div>

      {/* Body */}
      <div className="bg-card px-4 py-2.5 border-t border-border">
        {mode === 'percentage' && (
          <div className="flex gap-2 flex-wrap">
            {paths.map((p, i) => (
              <span key={i} className="text-xs font-medium" style={{ color: pathColors[i] || '#6b7280' }}>
                {p.label}: {p.percent}%
              </span>
            ))}
          </div>
        )}

        {mode === 'fixed_count' && (
          <div className="flex gap-2 flex-wrap">
            {paths.map((p, i) => (
              <span key={i} className="text-xs font-medium" style={{ color: pathColors[i] || '#6b7280' }}>
                {p.label}: {p.count || 0} leads
              </span>
            ))}
          </div>
        )}

        {isSeller && sellers.length > 0 && (
          <div className="space-y-1">
            <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
              <Users className="h-3 w-3" />
              <span>{sellers.length} vendedor{sellers.length > 1 ? 'es' : ''}</span>
              {assignOnly && <span className="text-[9px] bg-muted px-1 rounded">só atribuir</span>}
            </div>
            <div className="flex flex-wrap gap-1">
              {sellers.slice(0, 4).map((s, i) => (
                <span key={s.id} className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-primary/10 text-primary truncate max-w-[80px]">
                  {s.name}
                </span>
              ))}
              {sellers.length > 4 && (
                <span className="text-[10px] text-muted-foreground">+{sellers.length - 4}</span>
              )}
            </div>
          </div>
        )}

        {isSeller && sellers.length === 0 && (
          <p className="text-[10px] text-muted-foreground italic">Nenhum vendedor selecionado</p>
        )}
      </div>

      {/* Outputs */}
      <div className="relative h-5">
        {outputPaths.length === 1 ? (
          <Handle
            type="source"
            position={Position.Bottom}
            id="path_0"
            className="!bg-violet-500 !border-2 !border-white !w-3.5 !h-3.5"
          />
        ) : (
          outputPaths.map((p, i) => {
            const positions = outputPaths.length === 2 ? [30, 70] : outputPaths.length === 3 ? [20, 50, 80] : [15, 38, 62, 85];
            return (
              <React.Fragment key={i}>
                <Handle
                  type="source"
                  position={Position.Bottom}
                  id={`path_${i}`}
                  className="!border-2 !border-white !w-3.5 !h-3.5"
                  style={{ left: `${positions[i]}%`, background: pathColors[i] }}
                />
                <span
                  className="absolute text-[9px] font-bold"
                  style={{ left: `${positions[i]}%`, bottom: '-14px', transform: 'translateX(-50%)', color: pathColors[i] }}
                >
                  {isSeller && !assignOnly ? (p as any).sellerName?.split(' ')[0] || p.label : p.label}
                </span>
              </React.Fragment>
            );
          })
        )}
      </div>
    </div>
  );
}

export default WzAbSplitNode;
