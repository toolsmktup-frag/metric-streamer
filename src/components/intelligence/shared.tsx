import React from 'react';
import { formatCurrency } from '@/lib/formatters';

export function pct(v: number) { return `${v.toFixed(1)}%`; }

export function Badge({ type }: { type: string }) {
  const colors: Record<string, string> = {
    front: 'bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300',
    backend: 'bg-purple-100 text-purple-700 dark:bg-purple-950/40 dark:text-purple-300',
    physical: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300',
  };
  const labels: Record<string, string> = { front: 'Front', backend: 'Back-end', physical: 'Físico' };
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${colors[type] || ''}`}>
      {labels[type] || type}
    </span>
  );
}

export function ProgressBar({ value, max, color = 'bg-primary' }: { value: number; max: number; color?: string }) {
  const pctVal = max > 0 ? Math.min((value / max) * 100, 100) : 0;
  return (
    <div className="w-full bg-border rounded-full h-1.5">
      <div className={`${color} h-1.5 rounded-full transition-all`} style={{ width: `${pctVal}%` }} />
    </div>
  );
}

export function ScoreDot({ score }: { score: number }) {
  const colors = ['', 'bg-red-400', 'bg-orange-400', 'bg-yellow-400', 'bg-emerald-400', 'bg-emerald-600'];
  return (
    <span className={`inline-flex items-center justify-center w-5 h-5 rounded-full text-white text-xs font-bold ${colors[score] || 'bg-muted'}`}>
      {score}
    </span>
  );
}

export function LoadingState({ message }: { message: string }) {
  return (
    <div className="flex items-center justify-center h-48 gap-3 text-muted-foreground">
      <div className="h-5 w-5 animate-spin rounded-full border-2 border-muted-foreground border-t-transparent" />
      <span>{message}</span>
    </div>
  );
}
