import React from 'react';

interface Props {
  label: string;
  value: string;
  sub?: string;
  icon: any;
  color?: string;
  tooltip?: string;
}

export function MetricCard({ label, value, sub, icon: Icon, color, tooltip }: Props) {
  return (
    <div className="rounded-xl border border-border bg-card p-4 hover:shadow-md transition-shadow" title={tooltip}>
      <div className="flex items-center gap-2 mb-2">
        <div className={`h-8 w-8 rounded-lg flex items-center justify-center ${color || 'bg-primary/10 text-primary'}`}>
          <Icon className="h-4 w-4" />
        </div>
        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{label}</span>
      </div>
      <div className="text-xl font-bold font-mono-value text-foreground">{value}</div>
      {sub && <div className="text-xs text-muted-foreground mt-0.5">{sub}</div>}
    </div>
  );
}
