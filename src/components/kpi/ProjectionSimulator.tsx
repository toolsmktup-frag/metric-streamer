import React, { useState } from 'react';
import { SlidersHorizontal } from 'lucide-react';
import { formatCurrency, formatNumber } from '@/lib/formatters';

interface Props {
  totals: {
    impressions: number;
    clicks: number;
    pageviews: number;
    checkouts: number;
    vendas_principal: number;
    spend: number;
  };
  ctr: number;
  pvSobreClicks: number;
  checkoutSobrePv: number;
  vendasSobreCheckout: number;
  totalRevenue: number;
  acv: number;
}

export function ProjectionSimulator({ totals, ctr, pvSobreClicks, checkoutSobrePv, vendasSobreCheckout, totalRevenue, acv }: Props) {
  const [simCtr, setSimCtr] = useState<number | ''>('');
  const [simPvClicks, setSimPvClicks] = useState<number | ''>('');
  const [simCheckoutPv, setSimCheckoutPv] = useState<number | ''>('');
  const [simConvCheckout, setSimConvCheckout] = useState<number | ''>('');

  const simClicks = simCtr !== '' ? totals.impressions * (simCtr / 100) : totals.clicks;
  const simPageviews = simPvClicks !== '' ? simClicks * (simPvClicks / 100) : totals.pageviews;
  const simCheckouts = simCheckoutPv !== '' ? simPageviews * (simCheckoutPv / 100) : totals.checkouts;
  const simVendas = simConvCheckout !== '' && simCheckouts > 0
    ? simCheckouts * (simConvCheckout / 100)
    : totals.vendas_principal;
  const simRevenue = simVendas * acv;
  const simLucro = simRevenue - totals.spend;
  const simRoi = totals.spend > 0 ? ((simRevenue - totals.spend) / totals.spend) * 100 : 0;

  const inputClass = "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm font-mono-value focus:outline-none focus:ring-2 focus:ring-ring";

  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <h3 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
        <SlidersHorizontal className="h-4 w-4 text-primary" />
        Simulador de Projeção
        <span className="text-xs text-muted-foreground font-normal ml-2">Altere os valores para simular melhorias no funil</span>
      </h3>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-5">
        {[
          { label: `CTR (atual: ${ctr.toFixed(2)}%)`, value: simCtr, setter: setSimCtr, placeholder: ctr.toFixed(2), step: '0.1', hint: 'Ideal: 1,5%+ (efetividade dos anúncios)' },
          { label: `PV / Cliques (atual: ${pvSobreClicks.toFixed(1)}%)`, value: simPvClicks, setter: setSimPvClicks, placeholder: pvSobreClicks.toFixed(1), step: '1', hint: 'Ideal: 85-90% (velocidade da página)' },
          { label: `Checkout / PV (atual: ${checkoutSobrePv > 0 ? `${checkoutSobrePv.toFixed(1)}%` : '—'})`, value: simCheckoutPv, setter: setSimCheckoutPv, placeholder: '30', step: '1', hint: 'Conversão da página' },
          { label: `Conv. Checkout (atual: ${vendasSobreCheckout > 0 ? `${vendasSobreCheckout.toFixed(1)}%` : '—'})`, value: simConvCheckout, setter: setSimConvCheckout, placeholder: '20', step: '1', hint: 'Ideal: 16-20% (conversão do checkout)' },
        ].map(({ label, value, setter, placeholder, step, hint }) => (
          <div key={label}>
            <label className="text-xs text-muted-foreground mb-1 block">{label}</label>
            <div className="flex items-center gap-2">
              <input type="number" step={step} min="0" max="100" placeholder={placeholder}
                value={value} onChange={e => setter(e.target.value ? Number(e.target.value) : '')}
                className={inputClass} />
              <span className="text-sm text-muted-foreground">%</span>
            </div>
            <div className="text-[10px] text-muted-foreground mt-1">{hint}</div>
          </div>
        ))}
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 pt-4 border-t border-border">
        <div className="text-center p-3 rounded-lg bg-muted/50">
          <div className="text-xs text-muted-foreground mb-1">Cliques Projetados</div>
          <div className="text-lg font-bold font-mono-value text-foreground">{formatNumber(Math.round(simClicks))}</div>
          {simCtr !== '' && <div className="text-[10px] text-primary font-medium">vs {formatNumber(totals.clicks)} atual</div>}
        </div>
        <div className="text-center p-3 rounded-lg bg-muted/50">
          <div className="text-xs text-muted-foreground mb-1">Vendas Projetadas</div>
          <div className="text-lg font-bold font-mono-value text-foreground">{formatNumber(Math.round(simVendas))}</div>
          {(simCtr !== '' || simConvCheckout !== '') && <div className="text-[10px] text-primary font-medium">vs {formatNumber(totals.vendas_principal)} atual</div>}
        </div>
        <div className="text-center p-3 rounded-lg bg-muted/50">
          <div className="text-xs text-muted-foreground mb-1">Faturamento Projetado</div>
          <div className="text-lg font-bold font-mono-value text-foreground">{formatCurrency(simRevenue)}</div>
          {simRevenue !== totalRevenue && <div className="text-[10px] text-primary font-medium">vs {formatCurrency(totalRevenue)} atual</div>}
        </div>
        <div className={`text-center p-3 rounded-lg ${simLucro >= 0 ? 'bg-kpi-positive/5' : 'bg-destructive/5'}`}>
          <div className="text-xs text-muted-foreground mb-1">Lucro Projetado</div>
          <div className={`text-lg font-bold font-mono-value ${simLucro >= 0 ? 'text-kpi-positive' : 'text-destructive'}`}>{formatCurrency(simLucro)}</div>
          <div className={`text-[10px] font-medium ${simRoi >= 0 ? 'text-kpi-positive' : 'text-destructive'}`}>ROI: {simRoi.toFixed(0)}%</div>
        </div>
      </div>
    </div>
  );
}
