import React, { useState, useMemo, useCallback } from 'react';
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis,
  CartesianGrid, Tooltip, Legend as RechartsLegend,
} from 'recharts';
import {
  TrendingUp, Users, ShoppingBag, Calculator, Loader2,
  Filter, Target, ChevronDown, ChevronUp, Info, Grid3X3,
  DollarSign, AlertTriangle, RefreshCw,
} from 'lucide-react';
import { formatCurrency } from '@/lib/formatters';
import {
  useCustomerJourney,
  calcEscadaValor,
  calcCrossSell,
  calcLTV,
  calcTopSequences,
  calcPerfis,
  PRODUCTS,
  FRONT_PRODUCTS,
} from '@/hooks/useCustomerJourney';
import {
  useRFM,
  SEGMENT_CONFIG,
  SEGMENT_ORDER,
  type RFMSegment,
  type RFMCustomer,
} from '@/hooks/useRFM';
import {
  useCohortAnalysis,
  COHORT_WINDOWS,
  type CohortRow,
  type CohortWindowKey,
} from '@/hooks/useCohortAnalysis';
import { useCAC } from '@/hooks/useCAC';
import { useCACOverrides, useUpsertCACOverride, useDeleteCACOverride } from '@/hooks/useCACOverrides';

type Tab = 'rfm' | 'cohort' | 'cac' | 'escada' | 'crosssell' | 'jornadas' | 'perfis' | 'ltv';

function pct(v: number) { return `${v.toFixed(1)}%`; }

// ─── Shared sub-components ──────────────────────────────────────────

function Badge({ type }: { type: string }) {
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

function ProgressBar({ value, max, color = 'bg-primary' }: { value: number; max: number; color?: string }) {
  const pctVal = max > 0 ? Math.min((value / max) * 100, 100) : 0;
  return (
    <div className="w-full bg-border rounded-full h-1.5">
      <div className={`${color} h-1.5 rounded-full transition-all`} style={{ width: `${pctVal}%` }} />
    </div>
  );
}

function ScoreDot({ score }: { score: number }) {
  const colors = ['', 'bg-red-400', 'bg-orange-400', 'bg-yellow-400', 'bg-emerald-400', 'bg-emerald-600'];
  return (
    <span className={`inline-flex items-center justify-center w-5 h-5 rounded-full text-white text-xs font-bold ${colors[score] || 'bg-muted'}`}>
      {score}
    </span>
  );
}

// ─── RFM Tab ───────────────────────────────────────────────────────

function RFMSegmentBadge({ segment }: { segment: RFMSegment }) {
  const cfg = SEGMENT_CONFIG[segment];
  return (
    <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium ${cfg.badgeClass}`}>
      {cfg.emoji} {cfg.label}
    </span>
  );
}

function RFMTab() {
  const { data, isLoading } = useRFM();
  const [selectedSegment, setSelectedSegment] = useState<RFMSegment | 'all'>('all');
  const [sortBy, setSortBy] = useState<'monetary' | 'recency' | 'frequency'>('monetary');
  const [sortAsc, setSortAsc] = useState(false);
  const [expandedSegment, setExpandedSegment] = useState<RFMSegment | null>(null);

  const filteredCustomers = useMemo(() => {
    if (!data) return [];
    const list = selectedSegment === 'all'
      ? data.customers
      : data.customers.filter(c => c.segment === selectedSegment);
    return [...list].sort((a, b) => {
      const va = sortBy === 'monetary' ? a.monetary : sortBy === 'recency' ? a.recencyDays : a.frequency;
      const vb = sortBy === 'monetary' ? b.monetary : sortBy === 'recency' ? b.recencyDays : b.frequency;
      return sortAsc ? va - vb : vb - va;
    });
  }, [data, selectedSegment, sortBy, sortAsc]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-48 gap-3 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
        <span>Calculando segmentos RFM...</span>
      </div>
    );
  }

  if (!data || data.totalCustomers === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border p-10 text-center text-muted-foreground">
        <Users className="h-8 w-8 mx-auto mb-3 opacity-40" />
        <p className="font-medium">Nenhum cliente com e-mail identificado ainda.</p>
        <p className="text-sm mt-1">Vendas com e-mail do cliente aparecerão aqui após os próximos webhooks.</p>
      </div>
    );
  }

  const champions = data.bySegment.champions;
  const atRisk = data.bySegment.at_risk;
  const lost = data.bySegment.lost;

  const toggleSort = (col: typeof sortBy) => {
    if (sortBy === col) setSortAsc(p => !p);
    else { setSortBy(col); setSortAsc(false); }
  };

  return (
    <div className="space-y-6">
      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="rounded-xl border border-border bg-card p-4 space-y-1">
          <p className="text-xs text-muted-foreground uppercase font-semibold">Clientes Analisados</p>
          <p className="text-3xl font-bold text-foreground">{data.totalCustomers.toLocaleString('pt-BR')}</p>
          <p className="text-xs text-muted-foreground">Guru + Ticto unificados — base do RFM</p>
        </div>
        <div className="rounded-xl border border-yellow-200 dark:border-yellow-800/50 bg-card p-4 space-y-1">
          <p className="text-xs text-yellow-700 dark:text-yellow-400 uppercase font-semibold">🏆 Campeões</p>
          <p className="text-3xl font-bold text-foreground">{champions.count.toLocaleString('pt-BR')}</p>
          <p className="text-xs text-muted-foreground">{pct(champions.pct)} da base · LTV médio {formatCurrency(champions.avgMonetary)}</p>
        </div>
        <div className="rounded-xl border border-orange-200 dark:border-orange-800/50 bg-card p-4 space-y-1">
          <p className="text-xs text-orange-700 dark:text-orange-400 uppercase font-semibold">⚠️ Em Risco</p>
          <p className="text-3xl font-bold text-foreground">{atRisk.count.toLocaleString('pt-BR')}</p>
          <p className="text-xs text-muted-foreground">{pct(atRisk.pct)} da base · Último contato {atRisk.avgRecencyDays}d atrás</p>
        </div>
        <div className="rounded-xl border border-red-200 dark:border-red-800/50 bg-card p-4 space-y-1">
          <p className="text-xs text-red-700 dark:text-red-400 uppercase font-semibold">❌ Perdidos</p>
          <p className="text-3xl font-bold text-foreground">{lost.count.toLocaleString('pt-BR')}</p>
          <p className="text-xs text-muted-foreground">{pct(lost.pct)} da base · Receita em risco {formatCurrency(lost.totalRevenue)}</p>
        </div>
      </div>

      {/* Segment grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {SEGMENT_ORDER.map(seg => {
          const cfg = SEGMENT_CONFIG[seg];
          const stats = data.bySegment[seg];
          const isExpanded = expandedSegment === seg;
          return (
            <div
              key={seg}
              className={`rounded-xl border bg-card p-4 space-y-3 cursor-pointer hover:shadow-sm transition-shadow ${cfg.cardClass}`}
              onClick={() => {
                setExpandedSegment(isExpanded ? null : seg);
                setSelectedSegment(seg);
              }}
            >
              <div className="flex items-center justify-between">
                <span className={`text-sm font-semibold ${cfg.colorClass}`}>
                  {cfg.emoji} {cfg.label}
                </span>
                <span className="text-2xl font-bold text-foreground">{stats.count}</span>
              </div>
              <div className="space-y-0.5 text-xs text-muted-foreground">
                <div className="flex justify-between">
                  <span>% da base</span>
                  <span className="font-medium text-foreground">{pct(stats.pct)}</span>
                </div>
                <div className="flex justify-between">
                  <span>LTV médio</span>
                  <span className="font-medium text-foreground">{formatCurrency(stats.avgMonetary)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Últ. compra</span>
                  <span className="font-medium text-foreground">{stats.avgRecencyDays}d atrás</span>
                </div>
              </div>
              {isExpanded && (
                <div className={`rounded-lg border p-2.5 text-xs ${cfg.badgeClass} space-y-1`}>
                  <p className="font-semibold">Ação recomendada:</p>
                  <p>{cfg.action}</p>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Customer table */}
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-b border-border bg-table-header">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-foreground">Clientes</span>
            <span className="text-xs text-muted-foreground">({filteredCustomers.length.toLocaleString('pt-BR')})</span>
          </div>
          <select
            value={selectedSegment}
            onChange={e => setSelectedSegment(e.target.value as RFMSegment | 'all')}
            className="rounded-lg border border-border bg-card px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          >
            <option value="all">Todos os segmentos</option>
            {SEGMENT_ORDER.map(seg => (
              <option key={seg} value={seg}>
                {SEGMENT_CONFIG[seg].emoji} {SEGMENT_CONFIG[seg].label} ({data.bySegment[seg].count})
              </option>
            ))}
          </select>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-table-header border-b border-border">
                <th className="px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground uppercase">Cliente</th>
                <th
                  className="px-4 py-2.5 text-center text-xs font-semibold text-muted-foreground uppercase cursor-pointer hover:text-foreground select-none"
                  onClick={() => toggleSort('recency')}
                >
                  <span className="flex items-center justify-center gap-1">
                    Recência
                    {sortBy === 'recency' ? (sortAsc ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />) : null}
                  </span>
                </th>
                <th
                  className="px-4 py-2.5 text-center text-xs font-semibold text-muted-foreground uppercase cursor-pointer hover:text-foreground select-none"
                  onClick={() => toggleSort('frequency')}
                >
                  <span className="flex items-center justify-center gap-1">
                    Compras
                    {sortBy === 'frequency' ? (sortAsc ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />) : null}
                  </span>
                </th>
                <th
                  className="px-4 py-2.5 text-right text-xs font-semibold text-muted-foreground uppercase cursor-pointer hover:text-foreground select-none"
                  onClick={() => toggleSort('monetary')}
                >
                  <span className="flex items-center justify-end gap-1">
                    Total Gasto
                    {sortBy === 'monetary' ? (sortAsc ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />) : null}
                  </span>
                </th>
                <th className="px-4 py-2.5 text-center text-xs font-semibold text-muted-foreground uppercase">R/F/M</th>
                <th className="px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground uppercase">Segmento</th>
              </tr>
            </thead>
            <tbody>
              {filteredCustomers.slice(0, 200).map((c: RFMCustomer) => (
                <tr key={c.email} className="border-b border-border hover:bg-table-hover">
                  <td className="px-4 py-2.5">
                    <div className="text-sm font-medium text-foreground truncate max-w-[180px]">{c.name || '—'}</div>
                    <div className="text-xs text-muted-foreground truncate max-w-[180px]">{c.email}</div>
                  </td>
                  <td className="px-4 py-2.5 text-center text-sm text-muted-foreground">
                    {c.recencyDays}d atrás
                  </td>
                  <td className="px-4 py-2.5 text-center font-medium">{c.frequency}</td>
                  <td className="px-4 py-2.5 text-right font-mono-value font-semibold">{formatCurrency(c.monetary)}</td>
                  <td className="px-4 py-2.5">
                    <div className="flex items-center justify-center gap-1">
                      <ScoreDot score={c.rScore} />
                      <ScoreDot score={c.fScore} />
                      <ScoreDot score={c.mScore} />
                    </div>
                  </td>
                  <td className="px-4 py-2.5">
                    <RFMSegmentBadge segment={c.segment} />
                  </td>
                </tr>
              ))}
              {filteredCustomers.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-muted-foreground text-sm">
                    Nenhum cliente neste segmento.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
          {filteredCustomers.length > 200 && (
            <div className="px-4 py-3 text-center text-xs text-muted-foreground border-t border-border">
              Exibindo 200 de {filteredCustomers.length.toLocaleString('pt-BR')} clientes — use o filtro de segmento para navegar
            </div>
          )}
        </div>
      </div>

      {/* Legend */}
      <div className="rounded-lg border border-border bg-muted/30 p-4 flex gap-3 text-sm text-muted-foreground">
        <Info className="h-4 w-4 shrink-0 mt-0.5" />
        <div>
          <strong className="text-foreground">Como funciona o RFM:</strong> cada cliente recebe pontuação de 1-5 em{' '}
          <strong className="text-foreground">Recência</strong> (quando comprou pela última vez),{' '}
          <strong className="text-foreground">Frequência</strong> (quantas vezes comprou) e{' '}
          <strong className="text-foreground">Monetário</strong> (quanto gastou no total). Os segmentos são definidos pela combinação dessas notas.
          {' '}Os dados unificam Guru e Ticto via identidade de cliente — todos os compradores são incluídos.
        </div>
      </div>
    </div>
  );
}

// ─── Cohort Tab ────────────────────────────────────────────────────

function cohortCellBg(value: number, max: number): string {
  if (max === 0) return '';
  const intensity = Math.min(value / max, 1);
  if (intensity > 0.8) return 'bg-emerald-600 text-white';
  if (intensity > 0.6) return 'bg-emerald-500 text-white';
  if (intensity > 0.4) return 'bg-emerald-400 text-white';
  if (intensity > 0.2) return 'bg-emerald-200 text-emerald-900 dark:bg-emerald-800 dark:text-emerald-100';
  return 'bg-emerald-50 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300';
}

// Palette for cohort lines — distinct, readable colors
const COHORT_COLORS = [
  '#10b981', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6',
  '#ec4899', '#06b6d4', '#84cc16', '#f97316', '#6366f1',
  '#14b8a6', '#a855f7', '#eab308', '#0ea5e9', '#22c55e',
];

function CohortTab() {
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

  // ⚠️ useMemo DEVE ficar antes de qualquer return condicional (Rules of Hooks)
  const defaultVisible = useMemo(
    () => (data && data.length > 0 ? new Set(data.slice(-8).map(r => r.cohort_label)) : new Set<string>()),
    [data],
  );

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-48 gap-3 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
        <span>Calculando análise de cohort...</span>
      </div>
    );
  }

  if (error || !data || data.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border p-10 text-center text-muted-foreground">
        <Grid3X3 className="h-8 w-8 mx-auto mb-3 opacity-40" />
        <p className="font-medium">Nenhum dado de cohort disponível.</p>
        {error && <p className="text-xs mt-1 text-destructive">{String(error)}</p>}
      </div>
    );
  }

  // Compute max LTV per window for color scaling
  const maxPerWindow: Record<CohortWindowKey, number> = {} as any;
  for (const w of COHORT_WINDOWS) {
    maxPerWindow[w.key] = Math.max(...data.map(r => r[w.key] ?? 0));
  }

  // Summary stats
  const totalCustomers = data.reduce((s, r) => s + r.customer_count, 0);
  const matureRows = data.filter(r => r.months_since_cohort >= 12);
  const avgLtv12m = matureRows.length > 0
    ? matureRows.reduce((s, r) => s + r.avg_ltv_12m, 0) / matureRows.length
    : 0;
  const recentRows = data.slice(-3);
  const recentCustomers = recentRows.reduce((s, r) => s + r.customer_count, 0);
  const bestCohort = [...data].sort((a, b) => b.avg_ltv_1m - a.avg_ltv_1m)[0];

  const visibleCohorts = selectedCohorts.size > 0 ? selectedCohorts : defaultVisible;

  // Chart data: one point per window, one series per cohort
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
            {/* Cohort selector pills */}
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

            {/* Chart */}
            <ResponsiveContainer width="100%" height={320}>
              <LineChart data={chartData} margin={{ top: 4, right: 16, left: 8, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis
                  dataKey="window"
                  tick={{ fontSize: 12 }}
                  className="text-muted-foreground"
                />
                <YAxis
                  tickFormatter={(v: number) => `R$${v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v.toFixed(0)}`}
                  tick={{ fontSize: 11 }}
                  width={56}
                  className="text-muted-foreground"
                />
                <Tooltip
                  formatter={(value: number, name: string) => [formatCurrency(value), name]}
                  contentStyle={{ fontSize: 12 }}
                />
                {visibleRows.map((row, i) => {
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
                <th className="px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground uppercase whitespace-nowrap border-b border-r border-border">
                  Cohort
                </th>
                <th className="px-3 py-2.5 text-center text-xs font-semibold text-muted-foreground uppercase border-b border-r border-border">
                  Clientes
                </th>
                {COHORT_WINDOWS.map(w => (
                  <th key={w.key} className="px-3 py-2.5 text-center text-xs font-semibold text-muted-foreground uppercase border-b border-r border-border whitespace-nowrap">
                    {w.label}
                  </th>
                ))}
                <th className="px-3 py-2.5 text-center text-xs font-semibold text-muted-foreground uppercase border-b border-border whitespace-nowrap">
                  Maturidade
                </th>
              </tr>
            </thead>
            <tbody>
              {data.map((row, idx) => (
                <tr key={row.cohort_month} className={idx % 2 === 0 ? 'bg-card' : 'bg-muted/20'}>
                  <td className="px-4 py-2.5 font-medium text-foreground whitespace-nowrap border-r border-border">
                    {row.cohort_label}
                  </td>
                  <td className="px-3 py-2.5 text-center text-muted-foreground border-r border-border">
                    {row.customer_count.toLocaleString('pt-BR')}
                  </td>
                  {COHORT_WINDOWS.map(w => {
                    const isComplete = row.months_since_cohort >= w.months;
                    const value = row[w.key] ?? 0;
                    return (
                      <td
                        key={w.key}
                        className={`px-3 py-2.5 text-center text-xs font-mono border-r border-border transition-colors ${
                          isComplete
                            ? cohortCellBg(value, maxPerWindow[w.key])
                            : 'text-muted-foreground/40 bg-muted/30'
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
            <strong className="text-foreground">Fontes:</strong> customer_purchases (Guru/Eduzz) + ticto_transactions (via e-mail). Identidade unificada por unified_customer_id.
          </p>
        </div>
      </div>
    </div>
  );
}

// ─── CAC Tab ───────────────────────────────────────────────────────

function ratioColor(ratio: number): string {
  if (ratio === 0) return 'text-muted-foreground';
  if (ratio >= 2)   return 'text-emerald-600 dark:text-emerald-400';
  if (ratio >= 1)   return 'text-yellow-600 dark:text-yellow-400';
  return 'text-red-600 dark:text-red-400';
}

function RatioBar({ ratio }: { ratio: number }) {
  const pct = Math.min((ratio / 3) * 100, 100);
  const color = ratio >= 2 ? 'bg-emerald-500' : ratio >= 1 ? 'bg-yellow-500' : 'bg-red-400';
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 bg-border rounded-full h-1.5">
        <div className={`${color} h-1.5 rounded-full transition-all`} style={{ width: `${pct}%` }} />
      </div>
      <span className={`text-xs font-mono font-semibold w-10 text-right ${ratioColor(ratio)}`}>
        {ratio > 0 ? `${ratio.toFixed(1)}x` : '—'}
      </span>
    </div>
  );
}

function CACTab({ journeys, journeysLoading }: {
  journeys: import('@/hooks/useCustomerJourney').CustomerJourney[];
  journeysLoading: boolean;
}) {
  const today = new Date();
  const d90 = new Date(today); d90.setDate(today.getDate() - 90);
  const fmt = (d: Date) => d.toISOString().split('T')[0];

  const [dateFrom, setDateFrom] = useState(fmt(d90));
  const [dateTo,   setDateTo]   = useState(fmt(today));

  const { data: overrides = [] } = useCACOverrides();
  const upsertOverride = useUpsertCACOverride();
  const deleteOverride = useDeleteCACOverride();

  const { data, isLoading: cacLoading } = useCAC(journeys, dateFrom, dateTo, overrides);

  // Jornadas ainda carregando
  if (journeysLoading) {
    return (
      <div className="flex items-center justify-center h-48 gap-3 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
        <span>Carregando jornadas de clientes...</span>
      </div>
    );
  }

  // Jornadas carregadas, CAC calculando
  if (cacLoading) {
    return (
      <div className="flex items-center justify-center h-48 gap-3 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
        <span>Calculando CAC vs LTV...</span>
      </div>
    );
  }

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
                        r.breakEvenDays <= 30  ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300' :
                        r.breakEvenDays <= 90  ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-300' :
                        'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300'
                      }`}>{r.breakEvenDays}d</span>
                  }
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Unattributed spend — atribuição manual */}
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

      {/* Overrides configurados (permite remover) */}
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
          <p><strong className="text-foreground">CAC misto</strong> = gasto total em anúncios ÷ todos os clientes novos no período (pagos + orgânicos). Clientes que já existiam na base antes do período são excluídos. Como inclui orgânico, o valor tende a ser menor que o CAC pago puro — use períodos curtos (30–60 dias) para resultados mais precisos.</p>
          <p><strong className="text-foreground">ROI 365d</strong> = LTV 365d ÷ CAC. Acima de 1x = recuperou o investimento. Acima de 2x = excelente.</p>
          <p><strong className="text-foreground">Break-even</strong> = estimativa de quantos dias até o LTV cobrir o CAC. Quanto menor, melhor.</p>
          <p><strong className="text-foreground">Atribuição</strong> por palavra-chave no nome da campanha no Meta.</p>
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ─────────────────────────────────────────────────────

// Tabs que precisam das jornadas de clientes
const JOURNEY_TABS: Tab[] = ['cac', 'escada', 'crosssell', 'jornadas', 'perfis', 'ltv'];

export default function EscadaValor() {
  const [tab, setTab] = useState<Tab>('rfm');

  // Lazy: só busca jornadas quando o usuário abrir uma aba que precisa delas
  const needsJourneys = JOURNEY_TABS.includes(tab);
  const { data: journeys = [], isLoading } = useCustomerJourney(needsJourneys);
  const { data: rfmData } = useRFM();

  const [csA, setCsA] = useState('guia_tinturas');
  const [csB, setCsB] = useState('');
  const [csTarget, setCsTarget] = useState('curso_erveiros');

  const escadaData = useMemo(() => isLoading ? [] : calcEscadaValor(journeys), [journeys, isLoading]);
  const crossSellData = useMemo(() => isLoading ? null : calcCrossSell(journeys, csA, csB || null, csTarget), [journeys, isLoading, csA, csB, csTarget]);
  const ltvData = useMemo(() => isLoading ? [] : calcLTV(journeys, [30, 90, 180, 365]), [journeys, isLoading]);
  const sequences = useMemo(() => isLoading ? [] : calcTopSequences(journeys), [journeys, isLoading]);
  const perfis = useMemo(() => isLoading ? null : calcPerfis(journeys), [journeys, isLoading]);

  const tabs: { key: Tab; label: string; icon: React.ElementType }[] = [
    { key: 'rfm',      label: 'Segmentação RFM',  icon: Target },
    { key: 'cohort',   label: 'Cohort Analysis',  icon: Grid3X3 },
    { key: 'cac',      label: 'CAC vs LTV',       icon: DollarSign },
    { key: 'escada',   label: 'Escada de Valor',  icon: TrendingUp },
    { key: 'crosssell',label: 'Cross-sell',       icon: Filter },
    { key: 'jornadas', label: 'Jornadas',         icon: ShoppingBag },
    { key: 'perfis',   label: 'Perfis',           icon: Users },
    { key: 'ltv',      label: 'LTV',              icon: Calculator },
  ];

  const journeyLoading = isLoading && tab !== 'rfm';

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Inteligência de Cliente</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          {tab === 'rfm'
            ? rfmData
              ? `${rfmData.totalCustomers.toLocaleString('pt-BR')} clientes analisados (Guru + Ticto) — RFM`
              : 'Calculando segmentos RFM...'
            : tab === 'cohort'
              ? 'LTV acumulado por mês de primeira compra — todas as plataformas'
            : tab === 'cac'
              ? 'Custo de aquisição vs LTV real por produto de entrada'
              : journeys.length > 0
                ? `${journeys.length.toLocaleString('pt-BR')} clientes únicos analisados (Ticto + Guru)`
                : 'Analisando dados de clientes...'}
        </p>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 border-b border-border overflow-x-auto">
        {tabs.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 whitespace-nowrap transition-colors ${
              tab === t.key
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            <t.icon className="h-4 w-4" />
            {t.label}
          </button>
        ))}
      </div>

      {/* ── TAB: RFM ── */}
      {tab === 'rfm' && <RFMTab />}

      {/* ── TAB: Cohort ── */}
      {tab === 'cohort' && <CohortTab />}

      {/* ── TAB: CAC vs LTV ── */}
      {tab === 'cac' && <CACTab journeys={journeys} journeysLoading={isLoading} />}

      {/* ── TAB: Escada de Valor ── */}
      {tab === 'escada' && (
        journeyLoading
          ? <div className="flex items-center justify-center h-48 gap-3 text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" /><span>Carregando jornadas...</span></div>
          : (
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
          )
      )}

      {/* ── TAB: Cross-sell ── */}
      {tab === 'crosssell' && (
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
      )}

      {/* ── TAB: Jornadas ── */}
      {tab === 'jornadas' && (
        journeyLoading
          ? <div className="flex items-center justify-center h-48 gap-3 text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" /></div>
          : (
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
          )
      )}

      {/* ── TAB: Perfis ── */}
      {tab === 'perfis' && (
        journeyLoading
          ? <div className="flex items-center justify-center h-48 gap-3 text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" /></div>
          : perfis && (
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
          )
      )}

      {/* ── TAB: LTV ── */}
      {tab === 'ltv' && (
        journeyLoading
          ? <div className="flex items-center justify-center h-48 gap-3 text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" /></div>
          : (
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
          )
      )}
    </div>
  );
}
