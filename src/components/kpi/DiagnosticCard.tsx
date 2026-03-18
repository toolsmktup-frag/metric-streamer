import React from 'react';
import { Lightbulb } from 'lucide-react';

interface Props {
  icon: any;
  title: string;
  value: string;
  ideal: string;
  tip: string;
  status: 'good' | 'warn' | 'bad';
}

export function DiagnosticCard({ icon: Icon, title, value, ideal, tip, status }: Props) {
  const bgMap = { good: 'bg-kpi-positive/5 border-kpi-positive/20', warn: 'bg-kpi-warning/5 border-kpi-warning/20', bad: 'bg-destructive/5 border-destructive/20' };
  const iconBg = { good: 'bg-kpi-positive/10 text-kpi-positive', warn: 'bg-kpi-warning/10 text-kpi-warning', bad: 'bg-destructive/10 text-destructive' };

  return (
    <div className={`rounded-xl border p-4 ${bgMap[status]}`}>
      <div className="flex items-center gap-2 mb-3">
        <div className={`h-8 w-8 rounded-lg flex items-center justify-center ${iconBg[status]}`}>
          <Icon className="h-4 w-4" />
        </div>
        <span className="text-sm font-semibold text-foreground">{title}</span>
      </div>
      <div className="text-xl font-bold font-mono-value text-foreground mb-1">{value}</div>
      <div className="text-[11px] text-muted-foreground">Ideal: {ideal}</div>
      <div className="mt-2 flex items-start gap-1.5">
        <Lightbulb className="h-3 w-3 text-kpi-warning mt-0.5 shrink-0" />
        <span className="text-[11px] text-muted-foreground leading-tight">{tip}</span>
      </div>
    </div>
  );
}
