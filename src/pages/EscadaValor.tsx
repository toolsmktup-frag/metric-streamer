import React, { useState, useMemo } from 'react';
import {
  TrendingUp, Users, ShoppingBag, Calculator,
  Filter, Target, Grid3X3, DollarSign, Loader2,
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
import { useRFM } from '@/hooks/useRFM';

// Extracted tab components
import RFMTab from '@/components/intelligence/RFMTab';
import CohortTab from '@/components/intelligence/CohortTab';
import CACTab from '@/components/intelligence/CACTab';
import { Badge, ProgressBar, pct, LoadingState } from '@/components/intelligence/shared';

type Tab = 'rfm' | 'cohort' | 'cac' | 'escada' | 'crosssell' | 'jornadas' | 'perfis' | 'ltv';

const JOURNEY_TABS: Tab[] = ['cac', 'escada', 'crosssell', 'jornadas', 'perfis', 'ltv'];

export default function EscadaValor() {
  const [tab, setTab] = useState<Tab>('rfm');

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
    { key: 'rfm',       label: 'Segmentação RFM',  icon: Target },
    { key: 'cohort',    label: 'Cohort Analysis',   icon: Grid3X3 },
    { key: 'cac',       label: 'CAC vs LTV',        icon: DollarSign },
    { key: 'escada',    label: 'Escada de Valor',   icon: TrendingUp },
    { key: 'crosssell', label: 'Cross-sell',        icon: Filter },
    { key: 'jornadas',  label: 'Jornadas',          icon: ShoppingBag },
    { key: 'perfis',    label: 'Perfis',            icon: Users },
    { key: 'ltv',       label: 'LTV',               icon: Calculator },
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

      {/* ── Extracted Tabs ── */}
      {tab === 'rfm' && <RFMTab />}
      {tab === 'cohort' && <CohortTab />}
      {tab === 'cac' && <CACTab journeys={journeys} journeysLoading={isLoading} />}

      {/* ── Escada de Valor ── */}
      {tab === 'escada' && (
        journeyLoading
          ? <LoadingState message="Carregando jornadas..." />
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

      {/* ── Cross-sell ── */}
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

      {/* ── Jornadas ── */}
      {tab === 'jornadas' && (
        journeyLoading
          ? <LoadingState message="Carregando jornadas..." />
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

      {/* ── Perfis ── */}
      {tab === 'perfis' && (
        journeyLoading
          ? <LoadingState message="Carregando perfis..." />
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

      {/* ── LTV ── */}
      {tab === 'ltv' && (
        journeyLoading
          ? <LoadingState message="Carregando dados de LTV..." />
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
