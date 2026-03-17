import React from 'react';
import { Handle, Position } from '@xyflow/react';
import { FileText, Layout, ShoppingCart, Gift, ArrowDownCircle, StickyNote } from 'lucide-react';
import { cn } from '@/lib/utils';

const pageTypeConfig: Record<string, { icon: React.ReactNode; label: string; color: string }> = {
  capture: { icon: <FileText className="h-4 w-4" />, label: 'Captura', color: '#3b82f6' },
  sales: { icon: <Layout className="h-4 w-4" />, label: 'Vendas', color: '#10b981' },
  checkout: { icon: <ShoppingCart className="h-4 w-4" />, label: 'Checkout', color: '#f59e0b' },
  thankyou: { icon: <Gift className="h-4 w-4" />, label: 'Obrigado', color: '#8b5cf6' },
  upsell: { icon: <ArrowDownCircle className="h-4 w-4 rotate-180" />, label: 'Upsell', color: '#ec4899' },
  downsell: { icon: <ArrowDownCircle className="h-4 w-4" />, label: 'Downsell', color: '#f97316' },
  content: { icon: <Layout className="h-4 w-4" />, label: 'Conteúdo', color: '#6366f1' },
};

interface PageNodeData {
  label: string;
  pageType: string;
  color: string;
  count: number;
  pageUrl?: string;
  thumbnailUrl?: string;
  selected?: boolean;
  notes?: string;
}

function PageNode({ data, selected }: { data: PageNodeData; selected?: boolean }) {
  const config = pageTypeConfig[data.pageType] || pageTypeConfig.content;
  const borderColor = data.color || config.color;
  const hasNotes = !!data.notes?.trim();

  return (
    <div
      className={cn(
        'rounded-xl border-2 bg-card min-w-[180px] shadow-md transition-shadow relative',
        selected && 'shadow-lg ring-2 ring-primary/30'
      )}
      style={{ borderColor }}
    >
      <Handle type="target" position={Position.Left} className="!bg-primary !w-3 !h-3" />

      {/* Notes indicator */}
      {hasNotes && (
        <div className="absolute -top-2 -right-2 z-10 bg-amber-400 rounded-full p-1 shadow-sm" title={data.notes}>
          <StickyNote className="h-3 w-3 text-amber-900" />
        </div>
      )}

      {/* Header with page type badge */}
      <div className="px-3 py-1.5 border-b border-border/50 flex items-center gap-2" style={{ backgroundColor: `${borderColor}15` }}>
        <span style={{ color: borderColor }}>{config.icon}</span>
        <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: borderColor }}>
          {config.label}
        </span>
      </div>

      {/* Thumbnail or placeholder */}
      {data.thumbnailUrl ? (
        <div className="h-20 bg-muted overflow-hidden">
          <img src={data.thumbnailUrl} alt="" className="w-full h-full object-cover" />
        </div>
      ) : (
        <div className="h-16 bg-muted/30 flex items-center justify-center">
          <span className="text-muted-foreground/40" style={{ fontSize: '28px' }}>
            {config.icon}
          </span>
        </div>
      )}

      {/* Body */}
      <div className="px-3 py-2">
        <p className="text-sm font-semibold text-foreground truncate">{data.label}</p>
        {data.pageUrl && (
          <p className="text-[10px] text-muted-foreground truncate mt-0.5">{data.pageUrl}</p>
        )}
      </div>

      {/* Metrics footer */}
      <div className="px-3 py-2 border-t border-border/50 flex items-center justify-between bg-muted/20 rounded-b-xl">
        <div className="flex items-center gap-1">
          <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
          <span className="text-xs font-bold text-foreground">{data.count}</span>
          <span className="text-[10px] text-muted-foreground">leads</span>
        </div>
      </div>

      <Handle type="source" position={Position.Right} className="!bg-primary !w-3 !h-3" />
    </div>
  );
}

export default PageNode;
