import React, { useMemo } from 'react';
import { formatCurrency } from '@/lib/formatters';
import type { CustomerJourney } from '@/hooks/useCustomerJourney';
import { calcLTV } from '@/hooks/useCustomerJourney';
import { LoadingState } from './shared';

interface Props {
  journeys: CustomerJourney[];
  isLoading: boolean;
}

export default function LTVTab({ journeys, isLoading }: Props) {
  const ltvData = useMemo(() => isLoading ? [] : calcLTV(journeys, [30, 90, 180, 365]), [journeys, isLoading]);

  if (isLoading) return <LoadingState message="Carregando dados de LTV..." />;

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">LTV médio por produto de entrada e CPA máximo sustentável (margem 30%).</p>
      <div className="rounded-xl border border-border bg-card overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-table-header border-b border-border">
              <th className="px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground uppercase">Front-end</th>
              <th className="px-4 py-2.5 text-center text-xs font-semibold text-muted-foreground uppercase">Clientes</th>
              <th className="px-4 py-2.5 text-center text-xs font-semibold text-muted-foreground uppercase">LTV 30d</th>
              <th className="px-4 py-2.5 text-center text-xs font-semibold text-muted-foreground uppercase">LTV 90d</th>
              <th className="px-4 py-2.5 text-center text-xs font-semibold text-muted-foreground uppercase">LTV 180d</th>
              <th className="px-4 py-2.5 text-center text-xs font-semibold text-muted-foreground uppercase">LTV 365d</th>
              <th className="px-4 py-2.5 text-center text-xs font-semibold text-emerald-600 uppercase">CPA Máx (30%)</th>
            </tr>
          </thead>
          <tbody>
            {ltvData.map(({ front, total, windowData }) => {
              const ltv365 = windowData.find(w => w.days === 365)?.avgLTV || 0;
              const cpaMax = ltv365 * 0.7;
              return (
                <tr key={front.key} className="border-b border-border hover:bg-table-hover">
                  <td className="px-4 py-3 font-medium">{front.label}</td>
                  <td className="px-4 py-3 text-center text-muted-foreground">{total.toLocaleString('pt-BR')}</td>
                  {windowData.map(w => (
                    <td key={w.days} className="px-4 py-3 text-center font-mono-value">{formatCurrency(w.avgLTV)}</td>
                  ))}
                  <td className="px-4 py-3 text-center font-mono-value font-semibold text-emerald-600">{formatCurrency(cpaMax)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-muted-foreground">
        * CPA Máximo = 70% do LTV 365d. Você pode pagar até esse valor por cliente e ainda ter 30% de margem no período de 1 ano.
      </p>
    </div>
  );
}
