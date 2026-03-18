import React, { useMemo } from 'react';
import { formatCurrency } from '@/lib/formatters';
import type { CustomerJourney } from '@/hooks/useCustomerJourney';
import { calcPerfis } from '@/hooks/useCustomerJourney';
import { ProgressBar, pct, LoadingState } from './shared';

interface Props {
  journeys: CustomerJourney[];
  isLoading: boolean;
}

export default function PerfisTab({ journeys, isLoading }: Props) {
  const perfis = useMemo(() => isLoading ? null : calcPerfis(journeys), [journeys, isLoading]);

  if (isLoading) return <LoadingState message="Carregando perfis..." />;
  if (!perfis) return null;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="rounded-xl border border-border bg-card p-5 space-y-1">
          <p className="text-xs text-muted-foreground uppercase font-semibold">Colecionadores (3+ produtos)</p>
          <p className="text-3xl font-bold text-foreground">{perfis.collectors.count.toLocaleString('pt-BR')}</p>
          <p className="text-sm text-muted-foreground">{pct(perfis.collectors.pct)} da base · Ticket médio {formatCurrency(perfis.collectors.avgSpent)}</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-5 space-y-1">
          <p className="text-xs text-muted-foreground uppercase font-semibold">Compradores de físico</p>
          <p className="text-3xl font-bold text-emerald-600">{perfis.physicalBuyers.count.toLocaleString('pt-BR')}</p>
          <p className="text-sm text-muted-foreground">{pct(perfis.physicalBuyers.pct)} da base · Ticket médio {formatCurrency(perfis.physicalBuyers.avgSpent)}</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-5 space-y-1">
          <p className="text-xs text-muted-foreground uppercase font-semibold">Top 20% (alto LTV)</p>
          <p className="text-3xl font-bold text-primary">{perfis.highLTV.count.toLocaleString('pt-BR')}</p>
          <p className="text-sm text-muted-foreground">A partir de {formatCurrency(perfis.highLTV.minSpent)} · Média {formatCurrency(perfis.highLTV.avgSpent)}</p>
        </div>
      </div>

      {perfis.physicalBuyers.priorProducts.length > 0 && (
        <div className="rounded-xl border border-border bg-card p-5 space-y-3">
          <h3 className="font-semibold text-foreground">Qual produto digital precede a compra de físico?</h3>
          <p className="text-xs text-muted-foreground">Entre compradores de Articulabem ou Supervita</p>
          <div className="space-y-2">
            {perfis.physicalBuyers.priorProducts.map(p => (
              <div key={p.label} className="flex items-center gap-3">
                <span className="text-sm w-48 truncate">{p.label}</span>
                <div className="flex-1"><ProgressBar value={p.count} max={perfis.physicalBuyers.priorProducts[0].count} color="bg-emerald-500" /></div>
                <span className="text-sm font-semibold w-12 text-right">{p.count}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {perfis.highLTV.entryProducts.length > 0 && (
        <div className="rounded-xl border border-border bg-card p-5 space-y-3">
          <h3 className="font-semibold text-foreground">Por onde entram os clientes de alto LTV?</h3>
          <div className="space-y-2">
            {perfis.highLTV.entryProducts.map(e => (
              <div key={e.label} className="flex items-center gap-3">
                <span className="text-sm w-48 truncate">{e.label}</span>
                <div className="flex-1"><ProgressBar value={e.count} max={perfis.highLTV.entryProducts[0].count} color="bg-primary" /></div>
                <span className="text-sm font-semibold w-12 text-right">{e.count}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
