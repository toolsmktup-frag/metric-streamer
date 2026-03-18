import React, { useState, useMemo } from 'react';
import type { CustomerJourney } from '@/hooks/useCustomerJourney';
import { calcCrossSell, PRODUCTS } from '@/hooks/useCustomerJourney';
import { pct } from './shared';

interface Props {
  journeys: CustomerJourney[];
}

export default function CrossSellTab({ journeys }: Props) {
  const [csA, setCsA] = useState('guia_tinturas');
  const [csB, setCsB] = useState('');
  const [csTarget, setCsTarget] = useState('curso_erveiros');

  const crossSellData = useMemo(() => calcCrossSell(journeys, csA, csB || null, csTarget), [journeys, csA, csB, csTarget]);

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-border bg-card p-5 space-y-4">
        <h3 className="font-semibold text-foreground">Qual combinação converte mais?</h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {[
            { label: 'Produto A (obrigatório)', value: csA, setter: setCsA, filter: (_: any) => true },
            { label: 'Produto B (opcional)', value: csB, setter: setCsB, filter: (p: any) => p.key !== csA, optional: true },
            { label: 'Produto alvo', value: csTarget, setter: setCsTarget, filter: (p: any) => p.key !== csA && p.key !== csB },
          ].map(({ label, value, setter, filter, optional }) => (
            <div key={label}>
              <label className="text-xs font-medium text-muted-foreground uppercase mb-1 block">{label}</label>
              <select
                value={value}
                onChange={e => setter(e.target.value)}
                className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              >
                {optional && <option value="">— Nenhum —</option>}
                {PRODUCTS.filter(filter).map(p => <option key={p.key} value={p.key}>{p.label}</option>)}
              </select>
            </div>
          ))}
        </div>
        {crossSellData && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
            <div className="rounded-lg border border-border p-4 space-y-2">
              <p className="text-xs text-muted-foreground">Só produto A</p>
              <p className="text-2xl font-bold text-foreground">{pct(crossSellData.onlyA.pct)}</p>
              <p className="text-sm text-muted-foreground">{crossSellData.onlyA.converted} de {crossSellData.onlyA.total} compraram o alvo</p>
            </div>
            {crossSellData.withAB && (
              <div className="rounded-lg border border-emerald-200 bg-emerald-50 dark:bg-emerald-950/20 p-4 space-y-2">
                <p className="text-xs text-muted-foreground">Produto A + B</p>
                <p className="text-2xl font-bold text-emerald-600">{pct(crossSellData.withAB.pct)}</p>
                <p className="text-sm text-muted-foreground">{crossSellData.withAB.converted} de {crossSellData.withAB.total} compraram o alvo</p>
                {crossSellData.onlyA.pct > 0 && (
                  <p className="text-xs font-semibold text-emerald-700">
                    {(crossSellData.withAB.pct / crossSellData.onlyA.pct).toFixed(1)}x mais que só A
                  </p>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
