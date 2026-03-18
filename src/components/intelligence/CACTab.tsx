import React, { useState } from 'react';
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis,
  CartesianGrid, Tooltip as RechartsTooltip, ReferenceLine, Cell,
} from 'recharts';
import { AlertTriangle, RefreshCw, Info, DollarSign } from 'lucide-react';
import { formatCurrency } from '@/lib/formatters';
import { FRONT_PRODUCTS } from '@/hooks/useCustomerJourney';
import { useCAC } from '@/hooks/useCAC';
import { useCACOverrides, useUpsertCACOverride, useDeleteCACOverride } from '@/hooks/useCACOverrides';
import type { CustomerJourney } from '@/hooks/useCustomerJourney';
import { LoadingState } from './shared';

function ratioColor(ratio: number): string {
  if (ratio === 0) return 'text-muted-foreground';
  if (ratio >= 2) return 'text-emerald-600 dark:text-emerald-400';
  if (ratio >= 1) return 'text-yellow-600 dark:text-yellow-400';
  return 'text-red-600 dark:text-red-400';
}

function RatioBar({ ratio }: { ratio: number }) {
  const pctVal = Math.min((ratio / 3) * 100, 100);
  const color = ratio >= 2 ? 'bg-emerald-500' : ratio >= 1 ? 'bg-yellow-500' : 'bg-red-400';
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 bg-border rounded-full h-1.5">
        <div className={`${color} h-1.5 rounded-full transition-all`} style={{ width: `${pctVal}%` }} />
      </div>
      <span className={`text-xs font-mono font-semibold w-10 text-right ${ratioColor(ratio)}`}>
        {ratio > 0 ? `${ratio.toFixed(1)}x` : '—'}
      </span>
    </div>
  );
}

interface Props {
  journeys: CustomerJourney[];
  journeysLoading: boolean;
}

export default function CACTab({ journeys, journeysLoading }: Props) {
  const today = new Date();
  const d90 = new Date(today); d90.setDate(today.getDate() - 90);
  const fmt = (d: Date) => d.toISOString().split('T')[0];

  const [dateFrom, setDateFrom] = useState(fmt(d90));
  const [dateTo, setDateTo] = useState(fmt(today));

  const { data: overrides = [] } = useCACOverrides();
  const upsertOverride = useUpsertCACOverride();
  const deleteOverride = useDeleteCACOverride();

  const { data, isLoading: cacLoading } = useCAC(journeys, dateFrom, dateTo, overrides);

  if (journeysLoading) return <LoadingState message="Carregando jornadas de clientes..." />;
  if (cacLoading) return <LoadingState message="Calculando CAC vs LTV..." />;

  if (!data?.hasData) {
    return (
      <div className="rounded-xl border border-dashed border-border p-10 text-center space-y-3">
        <RefreshCw className="h-8 w-8 mx-auto text-muted-foreground opacity-40" />
        <p className="font-medium text-foreground">Nenhum dado de campanha encontrado no período.</p>
        <p className="text-sm text-muted-foreground max-w-md mx-auto">
          Certifique-se de que a integração com a Meta está ativa e que existem dados de spend nas campanhas para o período selecionado.
        </p>
      </div>
    );
  }

  const { rows, totalSpend, unattributedSpend, unattributedCampaigns, unattributedDetails } = data;

  // Chart data for CAC vs LTV comparison
  const chartData = rows.filter(r => r.cac > 0).map(r => ({
    name: r.productLabel.length > 20 ? r.productLabel.slice(0, 18) + '…' : r.productLabel,
    fullName: r.productLabel,
    cac: r.cac,
    ltv365: r.ltv365,
    profitable: r.ratio365 >= 1,
  }));

  return (
    <div className="space-y-6">
      {/* Date filter */}
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-sm text-muted-foreground font-medium">Período do gasto:</span>
        <div className="flex items-center gap-2">
          <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
            className="rounded-lg border border-border bg-card px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
          <span className="text-muted-foreground text-sm">até</span>
          <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
            className="rounded-lg border border-border bg-card px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
        </div>
        <div className="ml-auto text-sm text-muted-foreground">
          Total gasto no período: <span className="font-semibold text-foreground">{formatCurrency(totalSpend)}</span>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="rounded-xl border border-border bg-card p-4 space-y-1">
          <p className="text-xs text-muted-foreground uppercase font-semibold">Total Gasto</p>
          <p className="text-2xl font-bold text-foreground">{formatCurrency(totalSpend)}</p>
          <p className="text-xs text-muted-foreground">{rows.length} produto(s) atribuídos</p>
        </div>
        {(() => {
          const profitable = rows.filter(r => r.ratio365 >= 1);
          const bestRatio = rows.reduce((best, r) => r.ratio365 > best.ratio365 ? r : best, rows[0]);
          const avgCac = rows.filter(r => r.cac > 0).reduce((s, r) => s + r.cac, 0) / (rows.filter(r => r.cac > 0).length || 1);
          return (
            <>
              <div className="rounded-xl border border-emerald-200 dark:border-emerald-800/50 bg-card p-4 space-y-1">
                <p className="text-xs text-emerald-700 dark:text-emerald-400 uppercase font-semibold">Lucrativos (365d)</p>
                <p className="text-2xl font-bold text-foreground">{profitable.length}/{rows.length}</p>
                <p className="text-xs text-muted-foreground">produtos com LTV &gt; CAC</p>
              </div>
              <div className="rounded-xl border border-blue-200 dark:border-blue-800/50 bg-card p-4 space-y-1">
                <p className="text-xs text-blue-700 dark:text-blue-400 uppercase font-semibold">Melhor ROI (365d)</p>
                <p className="text-2xl font-bold text-foreground">{bestRatio ? `${bestRatio.ratio365.toFixed(1)}x` : '—'}</p>
                <p className="text-xs text-muted-foreground truncate">{bestRatio?.productLabel || '—'}</p>
              </div>
              <div className="rounded-xl border border-border bg-card p-4 space-y-1">
                <p className="text-xs text-muted-foreground uppercase font-semibold">CAC misto</p>
                <p className="text-2xl font-bold text-foreground">{formatCurrency(avgCac)}</p>
                <p className="text-xs text-muted-foreground">pago + orgânico (todos os canais)</p>
              </div>
            </>
          );
        })()}
      </div>

      {/* CAC vs LTV Bar Chart */}
      {chartData.length > 0 && (
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <div className="px-4 py-3 border-b border-border bg-table-header flex items-center gap-2">
            <DollarSign className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-semibold text-foreground">CAC vs LTV 365d por produto</span>
            <span className="text-xs text-muted-foreground">— a linha tracejada marca o break-even</span>
          </div>
          <div className="p-4">
            <ResponsiveContainer width="100%" height={Math.max(280, chartData.length * 50)}>
              <BarChart data={chartData} layout="vertical" margin={{ top: 4, right: 30, left: 10, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" horizontal={false} />
                <XAxis
                  type="number"
                  tickFormatter={(v: number) => `R$${v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v.toFixed(0)}`}
                  tick={{ fontSize: 11 }}
                  className="text-muted-foreground"
                />
                <YAxis
                  type="category"
                  dataKey="name"
                  width={160}
                  tick={{ fontSize: 11 }}
                  className="text-muted-foreground"
                />
                <RechartsTooltip
                  formatter={(value: number, name: string) => [
                    formatCurrency(value),
                    name === 'cac' ? 'CAC' : 'LTV 365d',
                  ]}
                  labelFormatter={(label: string) => {
                    const item = chartData.find(d => d.name === label);
                    return item?.fullName || label;
                  }}
                  contentStyle={{ fontSize: 12 }}
                />
                <Bar dataKey="cac" name="cac" fill="hsl(var(--destructive))" radius={[0, 4, 4, 0]} barSize={16} />
                <Bar dataKey="ltv365" name="ltv365" radius={[0, 4, 4, 0]} barSize={16}>
                  {chartData.map((entry, index) => (
                    <Cell
                      key={`cell-${index}`}
                      fill={entry.profitable ? '#10b981' : '#f59e0b'}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
            <div className="flex items-center justify-center gap-6 mt-3 text-xs text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded-sm bg-destructive" /> CAC
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded-sm bg-emerald-500" /> LTV 365d (lucrativo)
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded-sm bg-yellow-500" /> LTV 365d (abaixo do CAC)
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Main table */}
      <div className="rounded-xl border border-border bg-card overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-table-header border-b border-border">
              <th className="px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground uppercase">Produto</th>
              <th className="px-4 py-2.5 text-right text-xs font-semibold text-muted-foreground uppercase">Gasto</th>
              <th className="px-4 py-2.5 text-center text-xs font-semibold text-muted-foreground uppercase">Clientes novos</th>
              <th className="px-4 py-2.5 text-right text-xs font-semibold text-muted-foreground uppercase">CAC misto</th>
              <th className="px-4 py-2.5 text-right text-xs font-semibold text-muted-foreground uppercase">LTV 30d</th>
              <th className="px-4 py-2.5 text-right text-xs font-semibold text-muted-foreground uppercase">LTV 90d</th>
              <th className="px-4 py-2.5 text-right text-xs font-semibold text-muted-foreground uppercase">LTV 180d</th>
              <th className="px-4 py-2.5 text-right text-xs font-semibold text-muted-foreground uppercase">LTV 365d</th>
              <th className="px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground uppercase min-w-[120px]">ROI 365d</th>
              <th className="px-4 py-2.5 text-center text-xs font-semibold text-muted-foreground uppercase">Break-even</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.productKey} className="border-b border-border hover:bg-table-hover">
                <td className="px-4 py-3 font-medium text-foreground">{r.productLabel}</td>
                <td className="px-4 py-3 text-right font-mono-value">{r.totalSpend > 0 ? formatCurrency(r.totalSpend) : <span className="text-muted-foreground text-xs">sem dados</span>}</td>
                <td className="px-4 py-3 text-center text-muted-foreground">{r.newCustomers.toLocaleString('pt-BR')}</td>
                <td className="px-4 py-3 text-right font-mono-value">{r.cac > 0 ? formatCurrency(r.cac) : <span className="text-muted-foreground text-xs">—</span>}</td>
                <td className={`px-4 py-3 text-right font-mono-value text-xs ${r.ratio30 >= 1 ? 'text-emerald-600 dark:text-emerald-400' : ''}`}>{formatCurrency(r.ltv30)}</td>
                <td className={`px-4 py-3 text-right font-mono-value text-xs ${r.ratio90 >= 1 ? 'text-emerald-600 dark:text-emerald-400' : ''}`}>{formatCurrency(r.ltv90)}</td>
                <td className={`px-4 py-3 text-right font-mono-value text-xs ${r.ratio180 >= 1 ? 'text-emerald-600 dark:text-emerald-400' : ''}`}>{formatCurrency(r.ltv180)}</td>
                <td className={`px-4 py-3 text-right font-mono-value text-xs ${r.ratio365 >= 1 ? 'text-emerald-600 dark:text-emerald-400' : ''}`}>{formatCurrency(r.ltv365)}</td>
                <td className="px-4 py-3 min-w-[120px]"><RatioBar ratio={r.ratio365} /></td>
                <td className="px-4 py-3 text-center">
                  {r.cac === 0 ? <span className="text-xs text-muted-foreground">—</span>
                  : r.breakEvenDays === null
                    ? <span className="text-xs font-medium text-red-500">&gt;365d</span>
                    : <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                        r.breakEvenDays <= 30 ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300' :
                        r.breakEvenDays <= 90 ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-300' :
                        'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300'
                      }`}>{r.breakEvenDays}d</span>
                  }
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Unattributed spend */}
      {unattributedSpend > 0 && (
        <div className="rounded-lg border border-yellow-200 dark:border-yellow-800/50 bg-yellow-50 dark:bg-yellow-950/20 p-4 space-y-3">
          <div className="flex items-start gap-3">
            <AlertTriangle className="h-4 w-4 text-yellow-600 shrink-0 mt-0.5" />
            <p className="text-sm font-medium text-yellow-800 dark:text-yellow-300">
              {formatCurrency(unattributedSpend)} não atribuídos ({((unattributedSpend / totalSpend) * 100).toFixed(0)}% do total) — atribua abaixo:
            </p>
          </div>
          <div className="space-y-2">
            {unattributedDetails.map(c => (
              <div key={c.id} className="flex items-center gap-2 flex-wrap">
                <span className="text-xs text-yellow-800 dark:text-yellow-300 flex-1 min-w-0 truncate" title={c.name}>
                  {c.name}
                </span>
                <span className="text-xs font-semibold text-yellow-700 dark:text-yellow-400 shrink-0">
                  {formatCurrency(c.spend)}
                </span>
                <select
                  defaultValue=""
                  onChange={e => {
                    if (e.target.value) {
                      upsertOverride.mutate({ campaign_id: c.id, campaign_name: c.name, product_key: e.target.value });
                    }
                  }}
                  className="text-xs rounded border border-yellow-300 dark:border-yellow-700 bg-white dark:bg-yellow-950/40 px-2 py-1 focus:outline-none focus:ring-1 focus:ring-yellow-500 shrink-0"
                >
                  <option value="">Atribuir produto...</option>
                  {FRONT_PRODUCTS.map(p => (
                    <option key={p.key} value={p.key}>{p.label}</option>
                  ))}
                </select>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Overrides */}
      {overrides.length > 0 && (
        <div className="rounded-lg border border-border bg-muted/20 p-4 space-y-2">
          <p className="text-xs font-semibold text-muted-foreground uppercase">Atribuições manuais salvas (★)</p>
          <div className="space-y-1.5">
            {overrides.map(o => {
              const prod = FRONT_PRODUCTS.find(p => p.key === o.product_key);
              return (
                <div key={o.campaign_id} className="flex items-center gap-2 text-xs">
                  <span className="flex-1 truncate text-foreground" title={o.campaign_name}>{o.campaign_name}</span>
                  <span className="text-emerald-600 dark:text-emerald-400 font-medium shrink-0">→ {prod?.label || o.product_key}</span>
                  <button
                    onClick={() => deleteOverride.mutate(o.campaign_id)}
                    className="text-muted-foreground hover:text-red-500 transition-colors shrink-0 ml-1"
                    title="Remover atribuição"
                  >✕</button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Legend */}
      <div className="rounded-lg border border-border bg-muted/30 p-4 flex gap-3 text-sm text-muted-foreground">
        <Info className="h-4 w-4 shrink-0 mt-0.5" />
        <div className="space-y-1">
          <p><strong className="text-foreground">CAC misto</strong> = gasto total em anúncios ÷ todos os clientes novos no período (pagos + orgânicos).</p>
          <p><strong className="text-foreground">ROI 365d</strong> = LTV 365d ÷ CAC. Acima de 1x = recuperou o investimento. Acima de 2x = excelente.</p>
          <p><strong className="text-foreground">Break-even</strong> = estimativa de quantos dias até o LTV cobrir o CAC.</p>
        </div>
      </div>
    </div>
  );
}
