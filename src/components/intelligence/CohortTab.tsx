import React, { useState, useMemo, useCallback } from 'react';
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis,
  CartesianGrid, Tooltip as RechartsTooltip,
} from 'recharts';
import { TrendingUp, Grid3X3, Info } from 'lucide-react';
import { formatCurrency } from '@/lib/formatters';
import {
  useCohortAnalysis,
  COHORT_WINDOWS,
  type CohortRow,
  type CohortWindowKey,
} from '@/hooks/useCohortAnalysis';
import { LoadingState } from './shared';

const COHORT_COLORS = [
  '#10b981', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6',
  '#ec4899', '#06b6d4', '#84cc16', '#f97316', '#6366f1',
  '#14b8a6', '#a855f7', '#eab308', '#0ea5e9', '#22c55e',
];

function cohortCellBg(value: number, max: number): string {
  if (max === 0) return '';
  const intensity = Math.min(value / max, 1);
  if (intensity > 0.8) return 'bg-emerald-600 text-white';
  if (intensity > 0.6) return 'bg-emerald-500 text-white';
  if (intensity > 0.4) return 'bg-emerald-400 text-white';
  if (intensity > 0.2) return 'bg-emerald-200 text-emerald-900 dark:bg-emerald-800 dark:text-emerald-100';
  return 'bg-emerald-50 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300';
}

export default function CohortTab() {
  const { data, isLoading, error } = useCohortAnalysis();
  const [showChart, setShowChart] = useState(true);
  const [selectedCohorts, setSelectedCohorts] = useState<Set<string>>(new Set());

  const toggleCohort = useCallback((label: string) => {
    setSelectedCohorts(prev => {
      const next = new Set(prev);
      if (next.has(label)) next.delete(label);
      else next.add(label);
      return next;
    });
  }, []);

  const defaultVisible = useMemo(
    () => (data && data.length > 0 ? new Set(data.slice(-8).map(r => r.cohort_label)) : new Set<string>()),
    [data],
  );

  if (isLoading) return <LoadingState message="Calculando análise de cohort..." />;

  if (error || !data || data.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border p-10 text-center text-muted-foreground">
        <Grid3X3 className="h-8 w-8 mx-auto mb-3 opacity-40" />
        <p className="font-medium">Nenhum dado de cohort disponível.</p>
        {error && <p className="text-xs mt-1 text-destructive">{String(error)}</p>}
      </div>
    );
  }

  const maxPerWindow: Record<CohortWindowKey, number> = {} as any;
  for (const w of COHORT_WINDOWS) {
    maxPerWindow[w.key] = Math.max(...data.map(r => r[w.key] ?? 0));
  }

  const totalCustomers = data.reduce((s, r) => s + r.customer_count, 0);
  const matureRows = data.filter(r => r.months_since_cohort >= 12);
  const avgLtv12m = matureRows.length > 0
    ? matureRows.reduce((s, r) => s + r.avg_ltv_12m, 0) / matureRows.length
    : 0;
  const recentRows = data.slice(-3);
  const recentCustomers = recentRows.reduce((s, r) => s + r.customer_count, 0);
  const bestCohort = [...data].sort((a, b) => b.avg_ltv_1m - a.avg_ltv_1m)[0];

  const visibleCohorts = selectedCohorts.size > 0 ? selectedCohorts : defaultVisible;

  const chartData = COHORT_WINDOWS.map(w => {
    const point: Record<string, any> = { window: w.label };
    for (const row of data) {
      if (!visibleCohorts.has(row.cohort_label)) continue;
      const isComplete = row.months_since_cohort >= w.months;
      point[row.cohort_label] = isComplete ? row[w.key] : null;
    }
    return point;
  });

  const visibleRows = data.filter(r => visibleCohorts.has(r.cohort_label));

  return (
    <div className="space-y-6">
      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="rounded-xl border border-border bg-card p-4 space-y-1">
          <p className="text-xs text-muted-foreground uppercase font-semibold">Total Cohorts</p>
          <p className="text-3xl font-bold text-foreground">{data.length}</p>
          <p className="text-xs text-muted-foreground">{totalCustomers.toLocaleString('pt-BR')} clientes únicos</p>
        </div>
        <div className="rounded-xl border border-emerald-200 dark:border-emerald-800/50 bg-card p-4 space-y-1">
          <p className="text-xs text-emerald-700 dark:text-emerald-400 uppercase font-semibold">LTV médio 12m</p>
          <p className="text-3xl font-bold text-foreground">{formatCurrency(avgLtv12m)}</p>
          <p className="text-xs text-muted-foreground">Base: {matureRows.length} cohorts maduros</p>
        </div>
        <div className="rounded-xl border border-blue-200 dark:border-blue-800/50 bg-card p-4 space-y-1">
          <p className="text-xs text-blue-700 dark:text-blue-400 uppercase font-semibold">Melhor cohort (1m)</p>
          <p className="text-2xl font-bold text-foreground">{bestCohort.cohort_label}</p>
          <p className="text-xs text-muted-foreground">LTV 1m: {formatCurrency(bestCohort.avg_ltv_1m)} · {bestCohort.customer_count} clientes</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-4 space-y-1">
          <p className="text-xs text-muted-foreground uppercase font-semibold">Últimos 3 meses</p>
          <p className="text-3xl font-bold text-foreground">{recentCustomers.toLocaleString('pt-BR')}</p>
          <p className="text-xs text-muted-foreground">novos clientes adquiridos</p>
        </div>
      </div>

      {/* Line Chart */}
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="px-4 py-3 border-b border-border bg-table-header flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-semibold text-foreground">Evolução do LTV por cohort</span>
            <span className="text-xs text-muted-foreground">— clique nos cohorts abaixo para filtrar</span>
          </div>
          <button
            onClick={() => setShowChart(v => !v)}
            className="text-xs text-muted-foreground hover:text-foreground transition-colors px-2 py-1 rounded border border-border"
          >
            {showChart ? 'Ocultar' : 'Mostrar'}
          </button>
        </div>

        {showChart && (
          <div className="p-4 space-y-4">
            <div className="flex flex-wrap gap-2">
              {data.map((row, i) => {
                const color = COHORT_COLORS[i % COHORT_COLORS.length];
                const active = visibleCohorts.has(row.cohort_label);
                return (
                  <button
                    key={row.cohort_label}
                    onClick={() => toggleCohort(row.cohort_label)}
                    className={`flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full border transition-all ${
                      active
                        ? 'border-transparent text-white font-medium'
                        : 'border-border text-muted-foreground bg-card hover:border-foreground/30'
                    }`}
                    style={active ? { backgroundColor: color, borderColor: color } : {}}
                  >
                    {row.cohort_label}
                    <span className="opacity-70">({row.customer_count})</span>
                  </button>
                );
              })}
            </div>

            <ResponsiveContainer width="100%" height={320}>
              <LineChart data={chartData} margin={{ top: 4, right: 16, left: 8, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis dataKey="window" tick={{ fontSize: 12 }} className="text-muted-foreground" />
                <YAxis
                  tickFormatter={(v: number) => `R$${v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v.toFixed(0)}`}
                  tick={{ fontSize: 11 }} width={56} className="text-muted-foreground"
                />
                <RechartsTooltip
                  formatter={(value: number, name: string) => [formatCurrency(value), name]}
                  contentStyle={{ fontSize: 12 }}
                />
                {visibleRows.map((row) => {
                  const colorIdx = data.findIndex(d => d.cohort_label === row.cohort_label);
                  return (
                    <Line
                      key={row.cohort_label}
                      type="monotone"
                      dataKey={row.cohort_label}
                      stroke={COHORT_COLORS[colorIdx % COHORT_COLORS.length]}
                      strokeWidth={2}
                      dot={{ r: 4 }}
                      activeDot={{ r: 6 }}
                      connectNulls={false}
                    />
                  );
                })}
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {/* Heatmap table */}
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="px-4 py-3 border-b border-border bg-table-header flex items-center gap-2">
          <Grid3X3 className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-semibold text-foreground">Matriz de Cohort — LTV médio acumulado por janela</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="bg-table-header">
                <th className="px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground uppercase whitespace-nowrap border-b border-r border-border">Cohort</th>
                <th className="px-3 py-2.5 text-center text-xs font-semibold text-muted-foreground uppercase border-b border-r border-border">Clientes</th>
                {COHORT_WINDOWS.map(w => (
                  <th key={w.key} className="px-3 py-2.5 text-center text-xs font-semibold text-muted-foreground uppercase border-b border-r border-border whitespace-nowrap">{w.label}</th>
                ))}
                <th className="px-3 py-2.5 text-center text-xs font-semibold text-muted-foreground uppercase border-b border-border whitespace-nowrap">Maturidade</th>
              </tr>
            </thead>
            <tbody>
              {data.map((row, idx) => (
                <tr key={row.cohort_month} className={idx % 2 === 0 ? 'bg-card' : 'bg-muted/20'}>
                  <td className="px-4 py-2.5 font-medium text-foreground whitespace-nowrap border-r border-border">{row.cohort_label}</td>
                  <td className="px-3 py-2.5 text-center text-muted-foreground border-r border-border">{row.customer_count.toLocaleString('pt-BR')}</td>
                  {COHORT_WINDOWS.map(w => {
                    const isComplete = row.months_since_cohort >= w.months;
                    const value = row[w.key] ?? 0;
                    return (
                      <td
                        key={w.key}
                        className={`px-3 py-2.5 text-center text-xs font-mono border-r border-border transition-colors ${
                          isComplete ? cohortCellBg(value, maxPerWindow[w.key]) : 'text-muted-foreground/40 bg-muted/30'
                        }`}
                        title={isComplete ? `${row.cohort_label} — ${w.label}: ${formatCurrency(value)}` : 'Período ainda não atingido'}
                      >
                        {isComplete ? formatCurrency(value) : '—'}
                      </td>
                    );
                  })}
                  <td className="px-3 py-2.5 text-center border-border">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                      row.months_since_cohort >= 12
                        ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300'
                        : row.months_since_cohort >= 6
                          ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-300'
                          : 'bg-muted text-muted-foreground'
                    }`}>
                      {row.months_since_cohort}m
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Legend */}
      <div className="rounded-lg border border-border bg-muted/30 p-4 flex gap-3 text-sm text-muted-foreground">
        <Info className="h-4 w-4 shrink-0 mt-0.5" />
        <div className="space-y-1">
          <p>
            <strong className="text-foreground">Como ler a matriz:</strong> cada linha é um cohort (grupo de clientes pela primeira compra no mês).
            As colunas mostram o LTV médio acumulado após 1, 2, 3, 6, 9 e 12 meses.
          </p>
          <p>
            Células <strong className="text-foreground">cinzas (—)</strong> indicam janelas que ainda não foram atingidas pelo cohort.
            A intensidade da cor verde indica o valor relativo ao maior LTV daquela janela.
          </p>
          <p>
            <strong className="text-foreground">Fontes:</strong> v_all_sales (Ticto, Guru, Eduzz, Hotmart). Identidade unificada por customer_email e unified_customer_id.
          </p>
        </div>
      </div>
    </div>
  );
}
