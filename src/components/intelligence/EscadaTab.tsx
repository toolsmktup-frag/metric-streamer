import React from 'react';
import type { CustomerJourney } from '@/hooks/useCustomerJourney';
import { calcEscadaValor } from '@/hooks/useCustomerJourney';
import { Badge, ProgressBar, pct, LoadingState } from './shared';

interface Props {
  journeys: CustomerJourney[];
  isLoading: boolean;
}

export default function EscadaTab({ journeys, isLoading }: Props) {
  const escadaData = React.useMemo(() => isLoading ? [] : calcEscadaValor(journeys), [journeys, isLoading]);

  if (isLoading) return <LoadingState message="Carregando jornadas..." />;

  return (
    <div className="space-y-6">
      {escadaData.map(({ front, total, ascended, ascendedPct, backendStats, avgDaysToNext }) => (
        <div key={front.key} className="rounded-xl border border-border bg-card p-5 space-y-4">
          <div className="flex items-start justify-between">
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-semibold text-foreground">{front.label}</h3>
                <Badge type="front" />
              </div>
              <div className="flex flex-wrap items-center gap-4 mt-1 text-sm text-muted-foreground">
                <span><strong className="text-foreground">{total.toLocaleString('pt-BR')}</strong> clientes entraram</span>
                <span><strong className="text-emerald-600">{pct(ascendedPct)}</strong> compraram outro produto</span>
                {avgDaysToNext && <span>Média de <strong className="text-foreground">{avgDaysToNext} dias</strong> até próxima compra</span>}
              </div>
            </div>
          </div>
          {backendStats.length > 0 ? (
            <div className="space-y-2">
              <p className="text-xs font-semibold text-muted-foreground uppercase">O que compraram depois</p>
              <div className="grid gap-2">
                {backendStats.slice(0, 8).map(s => (
                  <div key={s.product.key} className="flex items-center gap-3">
                    <div className="w-40 shrink-0"><span className="text-sm truncate block">{s.product.label}</span></div>
                    <Badge type={s.product.type} />
                    <div className="flex-1">
                      <ProgressBar value={s.count} max={total} color={s.product.type === 'physical' ? 'bg-emerald-500' : 'bg-primary'} />
                    </div>
                    <div className="text-sm font-medium text-right w-24 shrink-0">
                      {s.count} <span className="text-muted-foreground text-xs">({pct(s.pct)})</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Nenhuma compra subsequente identificada ainda.</p>
          )}
        </div>
      ))}
    </div>
  );
}
