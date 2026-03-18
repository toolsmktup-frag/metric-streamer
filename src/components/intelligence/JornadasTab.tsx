import React, { useMemo } from 'react';
import type { CustomerJourney } from '@/hooks/useCustomerJourney';
import { calcTopSequences } from '@/hooks/useCustomerJourney';
import { LoadingState } from './shared';

interface Props {
  journeys: CustomerJourney[];
  isLoading: boolean;
}

export default function JornadasTab({ journeys, isLoading }: Props) {
  const sequences = useMemo(() => isLoading ? [] : calcTopSequences(journeys), [journeys, isLoading]);

  if (isLoading) return <LoadingState message="Carregando jornadas..." />;

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">Top 10 sequências de compra mais comuns entre os clientes.</p>
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-table-header border-b border-border">
              <th className="px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground uppercase">#</th>
              <th className="px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground uppercase">Sequência de compra</th>
              <th className="px-4 py-2.5 text-right text-xs font-semibold text-muted-foreground uppercase">Clientes</th>
            </tr>
          </thead>
          <tbody>
            {sequences.map((s, i) => (
              <tr key={i} className="border-b border-border hover:bg-table-hover">
                <td className="px-4 py-3 text-muted-foreground font-mono text-xs">{i + 1}</td>
                <td className="px-4 py-3 text-sm">{s.seq}</td>
                <td className="px-4 py-3 text-right font-semibold">{s.count}</td>
              </tr>
            ))}
            {sequences.length === 0 && (
              <tr><td colSpan={3} className="px-4 py-6 text-center text-muted-foreground text-sm">Nenhuma sequência encontrada.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
