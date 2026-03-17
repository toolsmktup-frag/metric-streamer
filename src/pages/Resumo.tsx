import React, { useMemo } from 'react';
import {
  DollarSign,
  TrendingUp,
  Target,
  ShoppingCart,
  BarChart3,
  MousePointerClick,
  Eye,
  Wallet,
  RefreshCw,
  Loader2,
  Package,
  Receipt,
  GitCompare,
} from 'lucide-react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip,
  ResponsiveContainer, PieChart, Pie, Cell, BarChart, Bar, Legend,
} from 'recharts';
import KPICard from '@/components/dashboard/KPICard';
import DateRangePicker from '@/components/dashboard/DateRangePicker';
import { useMetaCampaigns, useMetaKPISummary, useMetaDailyInsights, useSyncMeta, useSyncPollingRefetch, usePrevPeriodMetaInsights } from '@/hooks/useMetaData';
import { useAllSales, useAllSalesAggregation, usePrevPeriodAllSales } from '@/hooks/useAllSales';
import { useFilterStore } from '@/stores/filterStore';
import { formatCurrency, formatNumber, formatPercent, formatRoas, getRoasColor } from '@/lib/formatters';
import PerformanceTable from '@/components/dashboard/PerformanceTable';
import { SkeletonCard, SkeletonChart, SkeletonTable } from '@/components/dashboard/SkeletonCard';
import { toast } from 'sonner';

const emptyKpi = {
  revenue: 0, revenueVar: 0, spend: 0, spendVar: 0, roas: 0, roasVar: 0,
  profit: 0, profitVar: 0, sales: 0, salesVar: 0, cpa: 0, cpaVar: 0,
  ctr: 0, ctrVar: 0, impressions: 0, impressionsVar: 0,
};

export default function Resumo() {
  const { data: campaigns = [], isLoading: loadingCampaigns } = useMetaCampaigns();
  const { data: kpiSummary, isLoading: loadingKpi } = useMetaKPISummary();
  const { data: dailyMetrics = [], isLoading: loadingDaily } = useMetaDailyInsights();
  const { totalSales, byCampaign } = useAllSalesAggregation();
  const { data: allSales = [] } = useAllSales();
  const syncMeta = useSyncMeta();
  const syncStatus = useSyncPollingRefetch();

  const metaKpi = kpiSummary || emptyKpi;
  const { compareEnabled, setCompareEnabled } = useFilterStore();
  const { data: prevMetaInsights } = usePrevPeriodMetaInsights();
  const { data: prevSalesRaw = [] } = usePrevPeriodAllSales();

  const prevApproved = prevSalesRaw.filter(t => t.status === 'authorized');
  const prevRevenue = prevApproved.reduce((s, t) => s + t.revenue, 0);
  const prevSalesCount = prevApproved.length;
  const prevSpend = prevMetaInsights?.spend ?? 0;
  const prevRoas = prevSpend > 0 ? prevRevenue / prevSpend : 0;
  const prevProfit = prevRevenue - prevSpend;
  const prevCpa = prevSalesCount > 0 ? prevSpend / prevSalesCount : 0;

  function calcVar(current: number, prev: number): number | undefined {
    if (!compareEnabled || prev === 0) return undefined;
    return ((current - prev) / prev) * 100;
  }

  const approved = useMemo(() => allSales.filter(t => t.status === 'authorized'), [allSales]);

  // Override revenue/sales with Ticto data
  const kpi = {
    ...metaKpi,
    revenue: totalSales.revenue,
    sales: totalSales.sales_count,
    profit: totalSales.revenue - metaKpi.spend,
    roas: metaKpi.spend > 0 ? totalSales.revenue / metaKpi.spend : 0,
    cpa: totalSales.sales_count > 0 ? metaKpi.spend / totalSales.sales_count : 0,
  };

  const ticketMedio = approved.length > 0
    ? approved.reduce((s, t) => s + t.revenue, 0) / approved.length
    : 0;

  const daily = dailyMetrics.map(d => {
    const dayTx = allSales.filter(t => t.status === 'authorized' && t.purchased_at?.startsWith(d.date));
    const dayRevenue = dayTx.reduce((s, t) => s + t.revenue, 0);
    return { ...d, revenue: dayRevenue };
  });

  // Prev period daily data para o gráfico
  const prevDailyByDate = useMemo(() => {
    const map: Record<string, number> = {};
    for (const t of prevApproved) {
      if (t.purchased_at) {
        const d = t.purchased_at.slice(0, 10);
        map[d] = (map[d] || 0) + t.revenue;
      }
    }
    return map;
  }, [prevApproved]);

  // Mesclar prev no array daily — alinha pelo index (dia 1 atual vs dia 1 anterior)
  const dailyWithPrev = useMemo(() => {
    if (!compareEnabled) return daily;
    return daily.map((d, i) => ({
      ...d,
      prevRevenue: Object.values(prevDailyByDate)[i] ?? 0,
    }));
  }, [daily, prevDailyByDate, compareEnabled]);

  // Vendas por Produto
  const productData = useMemo(() => {
    const byProduct: Record<string, { name: string; count: number; revenue: number }> = {};
    for (const t of approved) {
      const key = t.product_name || 'Sem nome';
      if (!byProduct[key]) byProduct[key] = { name: key, count: 0, revenue: 0 };
      byProduct[key].count++;
      byProduct[key].revenue += t.revenue;
    }
    return Object.values(byProduct).sort((a, b) => b.count - a.count);
  }, [approved]);

  // Vendas por Horário
  const hourlyData = useMemo(() => {
    const byHour: number[] = Array(24).fill(0);
    for (const t of approved) {
      if (t.purchased_at) {
        const hour = new Date(t.purchased_at).getHours();
        byHour[hour]++;
      }
    }
    const total = approved.length || 1;
    return byHour.map((count, hour) => ({
      hour: `${String(hour).padStart(2, '0')}:00`,
      count,
      pct: (count / total) * 100,
    }));
  }, [approved]);

  // Vendas por Pagamento
  const paymentData = useMemo(() => {
    const byMethod: Record<string, { count: number; revenue: number }> = {};
    for (const t of approved) {
      const method = t.payment_method || 'outro';
      if (!byMethod[method]) byMethod[method] = { count: 0, revenue: 0 };
      byMethod[method].count++;
      byMethod[method].revenue += t.revenue;
    }
    const methodLabels: Record<string, string> = {
      credit_card: 'Cartão', pix: 'Pix', bank_slip: 'Boleto', outro: 'Outro',
    };
    const methodColors: Record<string, string> = {
      credit_card: 'hsl(210, 80%, 55%)', pix: 'hsl(152, 60%, 42%)', bank_slip: 'hsl(38, 92%, 50%)', outro: 'hsl(0, 0%, 60%)',
    };
    const total = approved.length || 1;
    return Object.entries(byMethod).map(([key, v]) => ({
      name: methodLabels[key] || key,
      value: v.count,
      revenue: v.revenue,
      pct: ((v.count / total) * 100).toFixed(1),
      color: methodColors[key] || 'hsl(0, 0%, 60%)',
    }));
  }, [approved]);

  const topCampaigns = [...campaigns]
    .map(c => {
      const sales = byCampaign[c.id] || { sales_count: 0, revenue: 0 };
      const roas = c.spend > 0 ? sales.revenue / c.spend : 0;
      return { ...c, roas, revenue: sales.revenue };
    })
    .filter(c => c.roas > 0)
    .sort((a, b) => b.roas - a.roas)
    .slice(0, 5);

  const isSyncRunning = syncStatus?.status === 'running' &&
    !!syncStatus?.started_at &&
    (Date.now() - new Date(syncStatus.started_at).getTime()) < 5 * 60 * 1000;
  const isSyncing = syncMeta.isPending || isSyncRunning;

  const handleSync = (fullSync = false) => {
    const label = fullSync ? 'Sincronização completa iniciada (30 dias)...' : 'Sincronizando hoje e ontem...';
    toast.info(label);
    syncMeta.mutate({ full_sync: fullSync }, {
      onSuccess: (data) => toast.success(`Sync concluído! ${data.records_synced ?? 0} registros — modo: ${data.mode ?? ''}`),
      onError: (err) => toast.error(`Erro no sync: ${err.message}`),
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-foreground">Resumo</h1>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setCompareEnabled(!compareEnabled)}
            className={`inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
              compareEnabled
                ? 'border-primary bg-primary/10 text-primary'
                : 'border-border bg-card text-muted-foreground hover:text-foreground'
            }`}
            title="Comparar com período anterior"
          >
            <GitCompare className="h-4 w-4" />
            Comparar
          </button>
          <DateRangePicker />
          {isSyncRunning && !syncMeta.isPending && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              <span>Sincronizando...</span>
            </div>
          )}
          {/* Sync rápido: hoje + ontem */}
          <button
            onClick={() => handleSync(false)}
            disabled={isSyncing}
            className="inline-flex items-center gap-2 rounded-lg bg-primary text-primary-foreground px-4 py-2 text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${isSyncing ? 'animate-spin' : ''}`} />
            {syncMeta.isPending ? 'Sincronizando...' : isSyncRunning ? 'Sincronizando...' : 'Sincronizar'}
          </button>
          {/* Sync completo: 30 dias */}
          <button
            onClick={() => handleSync(true)}
            disabled={isSyncing}
            title="Sincroniza os últimos 30 dias completos (mais lento)"
            className="inline-flex items-center gap-1 rounded-lg border border-border bg-card text-muted-foreground px-3 py-2 text-xs font-medium hover:text-foreground hover:border-foreground/30 transition-colors disabled:opacity-50"
          >
            30d
          </button>
        </div>
      </div>

      {campaigns.length === 0 && !loadingCampaigns && (
        <div className="rounded-lg border border-border bg-accent/50 p-4 text-sm text-muted-foreground">
          ⚠️ Nenhum dado encontrado. Clique em "Sincronizar Meta" para importar os dados da sua conta do Meta Ads.
        </div>
      )}

      {/* KPI Cards */}
      {loadingKpi ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 8 }, (_, i) => <SkeletonCard key={i} />)}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <KPICard label="Faturamento Líquido" value={formatCurrency(kpi.revenue)} variation={calcVar(kpi.revenue, prevRevenue)} icon={DollarSign} colorClass="text-kpi-positive" tooltip="Receita total das vendas aprovadas" />
          <KPICard label="Gastos com Anúncios" value={formatCurrency(kpi.spend)} variation={calcVar(kpi.spend, prevSpend)} icon={Wallet} tooltip="Total investido em anúncios" />
          <KPICard label="ROAS" value={formatRoas(kpi.roas)} variation={calcVar(kpi.roas, prevRoas)} icon={TrendingUp} colorClass={getRoasColor(kpi.roas)} tooltip="Return on Ad Spend" />
          <KPICard label="Lucro" value={formatCurrency(kpi.profit)} variation={calcVar(kpi.profit, prevProfit)} icon={BarChart3} colorClass={kpi.profit >= 0 ? 'text-kpi-positive' : 'text-kpi-negative'} tooltip="Faturamento - Gastos com anúncios" />
          <KPICard label="Vendas" value={formatNumber(kpi.sales)} variation={calcVar(kpi.sales, prevSalesCount)} icon={ShoppingCart} tooltip="Total de vendas aprovadas" />
          <KPICard label="Ticket Médio" value={formatCurrency(ticketMedio)} icon={Receipt} tooltip="Valor médio por venda aprovada" />
          <KPICard label="CPA" value={formatCurrency(kpi.cpa)} variation={calcVar(kpi.cpa, prevCpa)} icon={Target} tooltip="Custo por aquisição" />
          <KPICard label="Impressões" value={formatNumber(kpi.impressions)} variation={calcVar(kpi.impressions, prevMetaInsights?.impressions ?? 0)} icon={Eye} tooltip="Número total de impressões" />
        </div>
      )}

      {/* Charts Row 1: Faturamento + Vendas por Produto */}
      {loadingDaily ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <SkeletonChart />
          <SkeletonChart />
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="rounded-lg border border-border bg-card p-4">
            <h3 className="text-sm font-semibold text-foreground mb-4">Faturamento vs Gasto</h3>
            {daily.length > 0 ? (
              <ResponsiveContainer width="100%" height={280}>
                <LineChart data={dailyWithPrev}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} tickFormatter={(v) => v.split('-').slice(1).join('/')} />
                  <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `R$${v}`} />
                  <RechartsTooltip
                    formatter={(value: number, name: string) => [formatCurrency(value), name === 'revenue' ? 'Faturamento' : name === 'spend' ? 'Gasto' : 'Faturamento Anterior']}
                    labelFormatter={(label) => `Data: ${label}`}
                  />
                  <Line type="monotone" dataKey="revenue" stroke="hsl(152, 60%, 42%)" strokeWidth={2} dot={false} name="revenue" />
                  <Line type="monotone" dataKey="spend" stroke="hsl(0, 72%, 51%)" strokeWidth={2} dot={false} name="spend" />
                  {compareEnabled && (
                    <Line type="monotone" dataKey="prevRevenue" stroke="hsl(152, 60%, 42%)" strokeWidth={1.5} strokeDasharray="4 4" dot={false} name="prevRevenue" />
                  )}
                  <Legend formatter={(value) => value === 'revenue' ? 'Faturamento' : value === 'spend' ? 'Gasto' : 'Faturamento Anterior'} />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-[280px] text-sm text-muted-foreground">Sem dados para o período</div>
            )}
          </div>

          {/* Vendas por Produto */}
          <div className="rounded-lg border border-border bg-card p-4">
            <div className="flex items-center gap-2 mb-4">
              <Package className="h-4 w-4 text-muted-foreground" />
              <h3 className="text-sm font-semibold text-foreground">Vendas por Produto</h3>
            </div>
            {productData.length > 0 ? (
              <div className="space-y-3 max-h-[250px] overflow-y-auto pr-1">
                {productData.map((p, i) => {
                  const pct = approved.length > 0 ? (p.count / approved.length) * 100 : 0;
                  return (
                    <div key={i} className="space-y-1.5">
                      <div className="flex items-center justify-between text-sm">
                        <span className="font-medium text-foreground truncate max-w-[60%]" title={p.name}>{p.name}</span>
                        <div className="flex items-center gap-3 text-xs shrink-0">
                          <span className="font-mono-value text-muted-foreground">{p.count} vendas</span>
                          <span className="font-mono-value font-semibold text-foreground">{formatCurrency(p.revenue)}</span>
                          <span className="font-mono-value text-primary font-medium w-12 text-right">{pct.toFixed(1)}%</span>
                        </div>
                      </div>
                      <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                        <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="flex items-center justify-center h-[250px] text-sm text-muted-foreground">Sem vendas no período</div>
            )}
          </div>
        </div>
      )}

      {/* Charts Row 2: Pagamento + Taxa de Aprovação + Top Campanhas */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Vendas por Pagamento */}
        <div className="rounded-lg border border-border bg-card p-4">
          <h3 className="text-sm font-semibold text-foreground mb-3">Vendas por Pagamento</h3>
          {paymentData.length > 0 ? (
            <div className="space-y-3">
              {paymentData.map((pm, i) => (
                <div key={i} className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: pm.color }} />
                    <span className="text-sm text-foreground">{pm.name}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="font-mono-value text-xs text-muted-foreground">{pm.value}</span>
                    <span className="font-mono-value text-xs font-medium text-primary w-12 text-right">{pm.pct}%</span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex items-center justify-center h-[100px] text-sm text-muted-foreground">Sem vendas</div>
          )}
        </div>

        {/* Taxa de Aprovação */}
        <div className="rounded-lg border border-border bg-card p-4">
          <h3 className="text-sm font-semibold text-foreground mb-3">Taxa de Aprovação</h3>
          {(() => {
            const total = allSales.length;
            const approvedCount = approved.length;
            const refused = allSales.filter(t => ['refused', 'chargeback', 'refunded'].includes(t.status)).length;
            const pending = allSales.filter(t => ['waiting_payment', 'pix_created', 'bank_slip_created'].includes(t.status)).length;
            const approvalRate = total > 0 ? (approvedCount / total) * 100 : 0;
            return total > 0 ? (
              <div className="space-y-4">
                <div className="text-center">
                  <div className="text-3xl font-bold text-foreground font-mono-value">{approvalRate.toFixed(1)}%</div>
                  <div className="text-xs text-muted-foreground mt-1">{approvedCount} de {total} transações</div>
                </div>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Aprovadas</span>
                    <span className="font-mono-value font-medium text-kpi-positive">{approvedCount}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Pendentes</span>
                    <span className="font-mono-value font-medium text-kpi-warning">{pending}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Recusadas/Reembolsos</span>
                    <span className="font-mono-value font-medium text-kpi-negative">{refused}</span>
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-center h-[100px] text-sm text-muted-foreground">Sem dados</div>
            );
          })()}
        </div>

        {/* Top Campanhas por ROAS */}
        <div className="rounded-lg border border-border bg-card p-4">
          <h3 className="text-sm font-semibold text-foreground mb-2">Top 5 Campanhas por ROAS</h3>
          {topCampaigns.length > 0 ? (
            <ResponsiveContainer width="100%" height={140}>
              <BarChart data={topCampaigns} layout="vertical" margin={{ left: 0, right: 10 }}>
                <XAxis type="number" tick={{ fontSize: 10 }} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 9 }} width={120} tickFormatter={(v) => v.length > 18 ? v.slice(0, 18) + '…' : v} />
                <RechartsTooltip formatter={(value: number) => [formatRoas(value), 'ROAS']} />
                <Bar dataKey="roas" fill="hsl(152, 60%, 42%)" radius={[0, 4, 4, 0]} barSize={14} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex items-center justify-center h-[140px] text-sm text-muted-foreground">Sem dados</div>
          )}
        </div>
      </div>

      {/* Vendas por Horário */}
      {approved.length > 0 && (
        <div className="rounded-lg border border-border bg-card p-4">
          <h3 className="text-sm font-semibold text-foreground mb-4">Vendas por Horário</h3>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={hourlyData} margin={{ top: 10, right: 10, bottom: 0, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
              <XAxis dataKey="hour" tick={{ fontSize: 10 }} interval={1} />
              <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
              <RechartsTooltip
                formatter={(value: number, name: string) => {
                  if (name === 'count') return [`${value} vendas`, 'Vendas'];
                  return [value, name];
                }}
                labelFormatter={(label) => `Horário: ${label}`}
              />
              <Bar dataKey="count" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} barSize={20} name="count" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Campaign table */}
      <div>
        <h3 className="text-sm font-semibold text-foreground mb-3">Campanhas (Top 5 por vendas)</h3>
        {loadingCampaigns ? (
          <SkeletonTable />
        ) : campaigns.length > 0 ? (
          <PerformanceTable data={[...campaigns].map(c => {
            const sales = byCampaign[c.id] || { sales_count: 0, revenue: 0, front_sales: 0, bump_sales: 0, upsell_sales: 0 };
            return {
              ...c,
              sales: sales.sales_count,
              revenue: sales.revenue,
              front_sales: sales.front_sales,
              bump_sales: sales.bump_sales,
              upsell_sales: sales.upsell_sales,
              profit: sales.revenue - c.spend,
              roas: c.spend > 0 ? sales.revenue / c.spend : 0,
              cpa: sales.sales_count > 0 ? c.spend / sales.sales_count : 0,
            };
          }).filter(c => c.sales > 0).sort((a, b) => b.sales - a.sales).slice(0, 5)} />
        ) : (
          <div className="rounded-lg border border-border bg-card p-6 text-center text-sm text-muted-foreground">Sem campanhas sincronizadas</div>
        )}
      </div>
    </div>
  );
}
