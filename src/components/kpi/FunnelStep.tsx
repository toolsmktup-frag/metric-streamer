import React from 'react';

interface Props {
  label: string;
  value: string;
  rate?: string;
  rateLabel?: string;
  width: number;
  color: string;
  isFirst?: boolean;
}

export function FunnelStep({ label, value, rate, rateLabel, width, color, isFirst }: Props) {
  return (
    <div className="relative">
      {!isFirst && rate && (
        <div className="flex items-center justify-center py-1">
          <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-muted text-[11px] font-mono-value text-muted-foreground">
            <span>{rateLabel}:</span>
            <span className="font-semibold text-foreground">{rate}</span>
          </div>
        </div>
      )}
      <div className="flex items-center gap-3">
        <div className="w-28 text-right">
          <span className="text-xs font-medium text-muted-foreground">{label}</span>
        </div>
        <div className="flex-1 relative">
          <div className="h-10 rounded-lg overflow-hidden bg-muted/50" style={{ width: '100%' }}>
            <div
              className="h-full rounded-lg flex items-center justify-end pr-3 transition-all duration-500"
              style={{ width: `${Math.max(width, 5)}%`, backgroundColor: color }}
            >
              <span className="text-xs font-bold text-white font-mono-value drop-shadow-sm">{value}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
