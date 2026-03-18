import React, { useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase as _supabase } from '@/integrations/supabase/client';
const supabase = _supabase as any;
import { formatCurrency, formatNumber, formatPercent } from '@/lib/formatters';
import { SkeletonCard } from '@/components/dashboard/SkeletonCard';
import {
  TrendingUp, DollarSign, Eye, MousePointerClick,
  FileText, ShoppingCart, Target, BarChart3, Calculator, Gauge,
  SlidersHorizontal, ChevronLeft, ChevronRight, AlertTriangle,
  CheckCircle2, XCircle, Info, Lightbulb,
} from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useFunnel } from '@/hooks/useFunnels';

import { classifyTransaction, FUNNEL_PRODUCTS, avgUnitPrice } from '@/lib/classifyTransaction';

const PRODUCTS = FUNNEL_PRODUCTS;

function getActionValue(actions: any[] | null, actionType: string): number {
  if (!actions || !Array.isArray(actions)) return 0;
  const action = actions.find((a: any) =>
    a.action_type === actionType ||
    a.action_type === `offsite_conversion.fb_pixel_${actionType}`
  );
  return action ? Number(action.value) : 0;
}

// ─── Month helpers ───
const MONTH_NAMES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];

function getMonthRange(year: number, month: number) {
  const start = `${year}-${String(month + 1).padStart(2, '0')}-01`;
  const lastDay = new Date(year, month + 1, 0).getDate();
  const end = `${year}-${String(month + 1).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
  return { start, end, lastDay };
}

function getDaysInMonth(year: number, month: number): string[] {
  const today = new Date();
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  const lastDay = new Date(year, month + 1, 0).getDate();
  const days: string[] = [];
  for (let d = 1; d <= lastDay; d++) {
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    if (dateStr > todayStr) break;
    days.push(dateStr);
  }
  return days;
}

// ─── Status indicator ───
function StatusIndicator({ value, ideal, danger, label, invert }: {
  value: number; ideal: string; danger: string; label: string; invert?: boolean;
}) {
  const idealMatch = ideal.match(/([\d.]+)%?\s*[aà]\s*([\d.]+)%?/i);
  const dangerMatch = danger.match(/([\d.]+)%?/i);

  let status: 'good' | 'warn' | 'bad' = 'good';
  if (idealMatch) {
    const low = parseFloat(idealMatch[1]);
    const high = parseFloat(idealMatch[2]);
    if (invert) {
      status = value >= low && value <= high ? 'good' : value < low ? 'bad' : 'warn';
    } else {
      status = value >= low ? 'good' : value >= (dangerMatch ? parseFloat(dangerMatch[1]) : low * 0.5) ? 'warn' : 'bad';
    }
  } else if (dangerMatch) {
    const threshold = parseFloat(dangerMatch[1]);
    status = invert ? (value <= threshold ? 'good' : 'bad') : (value >= threshold ? 'good' : 'bad');
  }

  const colors = {
    good: 'bg-kpi-positive/10 text-kpi-positive border-kpi-positive/30',
    warn: 'bg-kpi-warning/10 text-kpi-warning border-kpi-warning/30',
    bad: 'bg-destructive/10 text-destructive border-destructive/30',
  };
  const icons = {
    good: <CheckCircle2 className="h-4 w-4" />,
    warn: <AlertTriangle className="h-4 w-4" />,
    bad: <XCircle className="h-4 w-4" />,
  };

  return (
    <div className={`rounded-xl border p-4 ${colors[status]}`}>
      <div className="flex items-center gap-2 mb-2">
        {icons[status]}
        <span className="text-xs font-semibold uppercase tracking-wide">{label}</span>
      </div>
      <div className="text-2xl font-bold font-mono-value">{value.toFixed(2)}%</div>
      <div className="text-[11px] mt-1 opacity-80">Ideal: {ideal}</div>
    </div>
  );
}

// ─── Diagnostic card ───
function DiagnosticCard({ icon: Icon, title, value, ideal, tip, status }: {
  icon: any; title: string; value: string; ideal: string; tip: string;
  status: 'good' | 'warn' | 'bad';
}) {
  const bgMap = { good: 'bg-kpi-positive/5 border-kpi-positive/20', warn: 'bg-kpi-warning/5 border-kpi-warning/20', bad: 'bg-destructive/5 border-destructive/20' };
  const iconBg = { good: 'bg-kpi-positive/10 text-kpi-positive', warn: 'bg-kpi-warning/10 text-kpi-warning', bad: 'bg-destructive/10 text-destructive' };

  return (
    <div className={`rounded-xl border p-4 ${bgMap[status]}`}>
      <div className="flex items-center gap-2 mb-3">
        <div className={`h-8 w-8 rounded-lg flex items-center justify-center ${iconBg[status]}`}>
          <Icon className="h-4 w-4" />
        </div>
        <span className="text-sm font-semibold text-foreground">{title}</span>
      </div>
      <div className="text-xl font-bold font-mono-value text-foreground mb-1">{value}</div>
      <div className="text-[11px] text-muted-foreground">Ideal: {ideal}</div>
      <div className="mt-2 flex items-start gap-1.5">
        <Lightbulb className="h-3 w-3 text-kpi-warning mt-0.5 shrink-0" />
        <span className="text-[11px] text-muted-foreground leading-tight">{tip}</span>
      </div>
    </div>
  );
}

// ─── Funnel step visual ───
function FunnelStep({ label, value, rate, rateLabel, width, color, isFirst }: {
  label: string; value: string; rate?: string; rateLabel?: string;
  width: number; color: string; isFirst?: boolean;
}) {
  return (
    <div className="relative">
      {!isFirst && rate && (
        <div className="flex items-center justify-center py-1">
          <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-muted text-[11px] font-mono-value text-muted-foreground">
            <span>{rateLabel}:</span>
            <span className="font-semibold text-foreground">{rate}</span>
          </div>
        </div>
      )}
      <div className="flex items-center gap-3">
        <div className="w-28 text-right">
          <span className="text-xs font-medium text-muted-foreground">{label}</span>
        </div>
        <div className="flex-1 relative">
          <div className="h-10 rounded-lg overflow-hidden bg-muted/50" style={{ width: '100%' }}>
            <div
              className="h-full rounded-lg flex items-center justify-end pr-3 transition-all duration-500"
              style={{ width: `${Math.max(width, 5)}%`, backgroundColor: color }}
            >
              <span className="text-xs font-bold text-white font-mono-value drop-shadow-sm">{value}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── MetricCard ───
function MetricCard({ label, value, sub, icon: Icon, color, tooltip }: {
  label: string; value: string; sub?: string; icon: any; color?: string; tooltip?: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-4 hover:shadow-md transition-shadow" title={tooltip}>
      <div className="flex items-center gap-2 mb-2">
        <div className={`h-8 w-8 rounded-lg flex items-center justify-center ${color || 'bg-primary/10 text-primary'}`}>
          <Icon className="h-4 w-4" />
        </div>
        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{label}</span>
      </div>
      <div className="text-xl font-bold font-mono-value text-foreground">{value}</div>
      {sub && <div className="text-xs text-muted-foreground mt-0.5">{sub}</div>}
    </div>
  );
}

export default function FunilKpi() {
  const { id } = useParams<{ id: string }>();
  const { data: funnel } = useFunnel(id!);

  const now = new Date();
  const [selectedYear, setSelectedYear] = useState(now.getFullYear());
  const [selectedMonth, setSelectedMonth] = useState(now.getMonth());

  const { start: dateFrom, end: dateTo } = getMonthRange(selectedYear, selectedMonth);
  const allDays = getDaysInMonth(selectedYear, selectedMonth);

  // ─── Fetch Meta insights for the month (isolated by funnel) ───
  const { data: metaInsights = [], isLoading: loadingMeta } = useQuery({
    queryKey: ['kpi-meta-insights', dateFrom, dateTo, id ?? 'all'],
    queryFn: async () => {
      // Two-step: get campaign IDs for this funnel, then filter insights
      let campaignIds: string[] | undefined;
      if (id) {
        const { data: cids } = await supabase
          .from('meta_campaigns')
          .select('id')
          .eq('funnel_id', id);
        campaignIds = (cids || []).map((c: any) => c.id);
        if (campaignIds.length === 0) return [];
      }

      let all: any[] = [];
      let from = 0;
      const pageSize = 1000;
      while (true) {
        let q = supabase
          .from('meta_insights')
          .select('*')
          .eq('object_type', 'campaign')
          .gte('date_start', dateFrom)
          .lte('date_start', dateTo);
        if (campaignIds && campaignIds.length > 0) {
          q = q.in('object_id', campaignIds);
        }
        const { data } = await q.range(from, from + pageSize - 1);
        if (!data || data.length === 0) break;
        all.push(...data);
        if (data.length < pageSize) break;
        from += pageSize;
      }
      return all;
    },
    staleTime: 2 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  });

  // ─── Fetch Ticto transactions for the month, filtered by funnel ───
  const { data: transactions = [], isLoading: loadingTicto } = useQuery({
    queryKey: ['kpi-ticto', dateFrom, dateTo, id],
    queryFn: async () => {
      let query = supabase
        .from('ticto_transactions')
        .select('*')
        .gte('order_date', `${dateFrom}T00:00:00`)
        .lte('order_date', `${dateTo}T23:59:59`)
        .order('order_date', { ascending: false });

      if (id) {
        query = query.eq('funnel_id', id);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    },
    staleTime: 2 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  });

  const approved = useMemo(() => transactions.filter((t: any) => t.status === 'authorized'), [transactions]);

  // ─── Build daily data ───
  const dailyRows = useMemo(() => {
    const metaByDate: Record<string, { spend: number; impressions: number; link_clicks: number; landing_page_views: number; checkouts: number }> = {};
    for (const row of metaInsights) {
      const d = row.date_start;
      if (!metaByDate[d]) metaByDate[d] = { spend: 0, impressions: 0, link_clicks: 0, landing_page_views: 0, checkouts: 0 };
      metaByDate[d].spend += Number(row.spend) || 0;
      metaByDate[d].impressions += Number(row.impressions) || 0;
      metaByDate[d].link_clicks += Number(row.link_clicks) || 0;
      metaByDate[d].landing_page_views += getActionValue(row.actions as any, 'landing_page_view');
      metaByDate[d].checkouts += getActionValue(row.actions as any, 'initiate_checkout');
    }

    return allDays.map(date => {
      const meta = metaByDate[date] || { spend: 0, impressions: 0, link_clicks: 0, landing_page_views: 0, checkouts: 0 };
      const dayTx = approved.filter((t: any) => t.order_date?.startsWith(date));

      let vp = 0, vb1 = 0, vu1 = 0, rp = 0, rb1 = 0, ru1 = 0;
      for (const tx of dayTx) {
        const type = classifyTransaction(tx);
        const rev = tx.paid_amount / 100;
        if (type === 'principal') { vp++; rp += rev; }
        else if (type === 'bump1') { vb1++; rb1 += rev; }
        else if (type === 'upsell1') { vu1++; ru1 += rev; }
      }

      return {
        date,
        spend: meta.spend,
        impressions: meta.impressions,
        clicks: meta.link_clicks,
        pageviews: meta.landing_page_views || meta.link_clicks,
        checkouts: meta.checkouts,
        vendas_principal: vp,
        vendas_bump1: vb1,
        vendas_upsell1: vu1,
        rev_principal: rp,
        rev_bump1: rb1,
        rev_upsell1: ru1,
      };
    });
  }, [metaInsights, approved, allDays]);

  // ─── Totals ───
  const totals = useMemo(() => {
    const t = { spend: 0, impressions: 0, clicks: 0, pageviews: 0, checkouts: 0,
      vendas_principal: 0, vendas_bump1: 0, vendas_upsell1: 0,
      rev_principal: 0, rev_bump1: 0, rev_upsell1: 0 };
    for (const r of dailyRows) {
      t.spend += r.spend; t.impressions += r.impressions; t.clicks += r.clicks;
      t.pageviews += r.pageviews; t.checkouts += r.checkouts;
      t.vendas_principal += r.vendas_principal; t.vendas_bump1 += r.vendas_bump1;
      t.vendas_upsell1 += r.vendas_upsell1;
      t.rev_principal += r.rev_principal; t.rev_bump1 += r.rev_bump1;
      t.rev_upsell1 += r.rev_upsell1;
    }
    return t;
  }, [dailyRows]);

  // ─── Computed metrics ───
  const totalVendasFunil = totals.vendas_principal + totals.vendas_bump1 + totals.vendas_upsell1;
  const totalRevenue = totals.rev_principal + totals.rev_bump1 + totals.rev_upsell1;
  const ctr = totals.impressions > 0 ? (totals.clicks / totals.impressions) * 100 : 0;
  const cpc = totals.clicks > 0 ? totals.spend / totals.clicks : 0;
  const pvSobreClicks = totals.clicks > 0 ? (totals.pageviews / totals.clicks) * 100 : 0;
  const checkoutSobrePv = totals.pageviews > 0 ? (totals.checkouts / totals.pageviews) * 100 : 0;
  const vendasSobreCheckout = totals.checkouts > 0 ? (totals.vendas_principal / totals.checkouts) * 100 : 0;
  const vendasSobreClique = totals.clicks > 0 ? (totals.vendas_principal / totals.clicks) * 100 : 0;
  const roi = totals.spend > 0 ? ((totalRevenue - totals.spend) / totals.spend) * 100 : 0;
  const lucro = totalRevenue - totals.spend;
  const cpaReal = totals.vendas_principal > 0 ? totals.spend / totals.vendas_principal : 0;
  const acv = totals.vendas_principal > 0 ? totalRevenue / totals.vendas_principal : 0;
  const pctBump1 = totals.vendas_principal > 0 ? (totals.vendas_bump1 / totals.vendas_principal) * 100 : 0;
  const pctUpsell1 = totals.vendas_principal > 0 ? (totals.vendas_upsell1 / totals.vendas_principal) * 100 : 0;
  const daysWithData = dailyRows.filter(r => r.spend > 0).length || 1;
  const vendasDia = totals.vendas_principal / daysWithData;
  const investDiario = totals.spend / daysWithData;
  const lucroDiario = lucro / daysWithData;

  // Diagnostics
  const diagCtr = ctr >= 1.5 ? 'good' : ctr >= 1.0 ? 'warn' : 'bad';
  const diagPv = pvSobreClicks >= 85 ? 'good' : pvSobreClicks >= 70 ? 'warn' : 'bad';
  const diagCheckout = checkoutSobrePv >= 20 ? 'good' : checkoutSobrePv >= 12 ? 'warn' : 'bad';
  const diagConv = vendasSobreCheckout >= 16 ? 'good' : vendasSobreCheckout >= 10 ? 'warn' : 'bad';
  const diagBump = pctBump1 >= 25 ? 'good' : pctBump1 >= 15 ? 'warn' : 'bad';
  const diagUpsell = pctUpsell1 >= 10 ? 'good' : pctUpsell1 >= 5 ? 'warn' : 'bad';

  // Simulator
  const [simCtr, setSimCtr] = useState<number | ''>('');
  const [simPvClicks, setSimPvClicks] = useState<number | ''>('');
  const [simCheckoutPv, setSimCheckoutPv] = useState<number | ''>('');
  const [simConvCheckout, setSimConvCheckout] = useState<number | ''>('');

  const simImpressions = totals.impressions;
  const simClicks = simCtr !== '' ? simImpressions * (simCtr / 100) : totals.clicks;
  const simPageviews = simPvClicks !== '' ? simClicks * (simPvClicks / 100) : totals.pageviews;
  const simCheckouts = simCheckoutPv !== '' ? simPageviews * (simCheckoutPv / 100) : totals.checkouts;
  const simVendas = simConvCheckout !== '' && simCheckouts > 0
    ? simCheckouts * (simConvCheckout / 100)
    : totals.vendas_principal;
  const simRevenue = simVendas * acv;
  const simLucro = simRevenue - totals.spend;
  const simRoi = totals.spend > 0 ? ((simRevenue - totals.spend) / totals.spend) * 100 : 0;

  // Month navigation
  const goMonth = (delta: number) => {
    let m = selectedMonth + delta;
    let y = selectedYear;
    if (m < 0) { m = 11; y--; }
    if (m > 11) { m = 0; y++; }
    setSelectedMonth(m);
    setSelectedYear(y);
  };

  const isCurrentMonth = selectedYear === now.getFullYear() && selectedMonth === now.getMonth();

  if (loadingMeta || loadingTicto) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          {funnel?.color && <span className="h-4 w-4 rounded-full shrink-0" style={{ backgroundColor: funnel.color }} />}
          <h1 className="text-2xl font-bold text-foreground">KPI — {funnel?.name || ''}</h1>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {Array.from({ length: 8 }, (_, i) => <SkeletonCard key={i} />)}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header + Month Picker */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          {funnel?.color && <span className="h-4 w-4 rounded-full shrink-0" style={{ backgroundColor: funnel.color }} />}
          <h1 className="text-2xl font-bold text-foreground">KPI — {funnel?.name || ''}</h1>
        </div>
        <div className="flex items-center gap-2 bg-card border border-border rounded-xl px-2 py-1.5">
          <button onClick={() => goMonth(-1)} className="p-1.5 rounded-lg hover:bg-muted transition-colors">
            <ChevronLeft className="h-4 w-4 text-muted-foreground" />
          </button>
          <span className="text-sm font-semibold text-foreground min-w-[150px] text-center">
            {MONTH_NAMES[selectedMonth]} de {selectedYear}
          </span>
          <button
            onClick={() => goMonth(1)}
            disabled={isCurrentMonth}
            className="p-1.5 rounded-lg hover:bg-muted transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          </button>
        </div>
      </div>

      {/* ─── TOP KPIs ─── */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4">
        <MetricCard label="Investimento" value={formatCurrency(totals.spend)} sub={`${formatCurrency(investDiario)}/dia`} icon={DollarSign} color="bg-destructive/10 text-destructive" />
        <MetricCard label="Faturamento" value={formatCurrency(totalRevenue)} icon={TrendingUp} color="bg-kpi-positive/10 text-kpi-positive" />
        <MetricCard label="Lucro" value={formatCurrency(lucro)} sub={`${formatCurrency(lucroDiario)}/dia`} icon={BarChart3} color={lucro >= 0 ? 'bg-kpi-positive/10 text-kpi-positive' : 'bg-destructive/10 text-destructive'} />
        <MetricCard label="ROI" value={`${roi.toFixed(0)}%`} icon={Target} color={roi >= 0 ? 'bg-kpi-positive/10 text-kpi-positive' : 'bg-destructive/10 text-destructive'} />
        <MetricCard label="ACV" value={formatCurrency(acv)} sub="Valor médio / cliente" icon={ShoppingCart} />
        <MetricCard label="CPA Real" value={formatCurrency(cpaReal)} sub={`${vendasDia.toFixed(1)} vendas/dia`} icon={Calculator} />
      </div>

      {/* ─── FUNIL DE CONVERSÃO VISUAL ─── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 rounded-xl border border-border bg-card p-5">
          <h3 className="text-sm font-semibold text-foreground mb-5 flex items-center gap-2">
            <Gauge className="h-4 w-4 text-primary" />
            Funil de Conversão
          </h3>
          <div className="space-y-1">
            <FunnelStep label="Impressões" value={formatNumber(totals.impressions)} width={100} color="hsl(var(--primary))" isFirst />
            <FunnelStep label="Cliques" value={formatNumber(totals.clicks)} rate={`${ctr.toFixed(2)}%`} rateLabel="CTR" width={Math.min(ctr * 10, 100)} color="hsl(210, 80%, 55%)" />
            <FunnelStep label="Pageviews" value={formatNumber(totals.pageviews)} rate={`${pvSobreClicks.toFixed(1)}%`} rateLabel="PV/Cliques" width={pvSobreClicks} color="hsl(38, 92%, 50%)" />
            <FunnelStep label="Checkouts" value={formatNumber(totals.checkouts)} rate={`${checkoutSobrePv.toFixed(1)}%`} rateLabel="Checkout/PV" width={checkoutSobrePv} color="hsl(280, 60%, 55%)" />
            <FunnelStep label="Vendas (P1)" value={formatNumber(totals.vendas_principal)} rate={`${vendasSobreCheckout.toFixed(1)}%`} rateLabel="Conv. Checkout" width={vendasSobreCheckout} color="hsl(152, 60%, 42%)" />
          </div>
          <div className="mt-4 pt-3 border-t border-border grid grid-cols-3 gap-3 text-xs text-center">
            <div>
              <span className="text-muted-foreground block">CPC</span>
              <span className="font-mono-value font-semibold text-foreground">{formatCurrency(cpc)}</span>
            </div>
            <div>
              <span className="text-muted-foreground block">Vendas / Clique</span>
              <span className="font-mono-value font-semibold text-foreground">{vendasSobreClique.toFixed(2)}%</span>
            </div>
            <div>
              <span className="text-muted-foreground block">CPA Real</span>
              <span className="font-mono-value font-semibold text-foreground">{formatCurrency(cpaReal)}</span>
            </div>
          </div>
        </div>

        {/* ─── VENDAS DO FUNIL com % do total ─── */}
        <div className="rounded-xl border border-border bg-card p-5">
          <h3 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
            <ShoppingCart className="h-4 w-4 text-primary" />
            Vendas do Funil
          </h3>
          <div className="space-y-3">
            {/* Principal */}
            <div className="rounded-lg bg-primary/5 p-3 border border-primary/20">
              <div className="flex justify-between items-center">
                <span className="text-sm font-semibold text-foreground">{PRODUCTS.principal.label}</span>
                <span className="text-[10px] bg-primary/10 text-primary px-2 py-0.5 rounded-full font-medium">Principal</span>
              </div>
              <div className="flex items-baseline gap-3 mt-2">
                <span className="text-2xl font-bold font-mono-value text-foreground">{totals.vendas_principal}</span>
                <span className="text-xs text-muted-foreground">vendas</span>
                <span className="text-xs font-mono-value font-semibold text-kpi-positive ml-auto">{formatCurrency(totals.rev_principal)}</span>
              </div>
              <div className="flex items-center justify-between mt-1">
                <span className="text-[11px] text-muted-foreground">
                  {totalVendasFunil > 0 ? ((totals.vendas_principal / totalVendasFunil) * 100).toFixed(1) : 0}% do funil
                </span>
                <span className="text-[11px] text-muted-foreground">{formatCurrency(PRODUCTS.principal.price)}/un</span>
              </div>
            </div>

            {/* Bump 1 */}
            <div className="rounded-lg bg-kpi-warning/5 p-3 border border-kpi-warning/20">
              <div className="flex justify-between items-center">
                <span className="text-sm font-semibold text-foreground">{PRODUCTS.bump1.label}</span>
                <span className="text-[10px] bg-kpi-warning/10 text-kpi-warning px-2 py-0.5 rounded-full font-medium">Bump</span>
              </div>
              <div className="flex items-baseline gap-3 mt-2">
                <span className="text-2xl font-bold font-mono-value text-foreground">{totals.vendas_bump1}</span>
                <span className="text-xs text-muted-foreground">vendas</span>
                <span className="text-xs font-mono-value font-semibold text-kpi-positive ml-auto">{formatCurrency(totals.rev_bump1)}</span>
              </div>
              <div className="flex items-center justify-between mt-1">
                <span className="text-[11px] text-muted-foreground">
                  {totalVendasFunil > 0 ? ((totals.vendas_bump1 / totalVendasFunil) * 100).toFixed(1) : 0}% do funil
                </span>
                <span className="text-[11px] text-muted-foreground">
                  <span className="font-mono-value font-medium">{pctBump1.toFixed(1)}%</span> das vendas P1
                  <Tooltip>
                    <TooltipTrigger asChild><Info className="h-3 w-3 inline ml-1 cursor-help" /></TooltipTrigger>
                    <TooltipContent><p className="text-xs">Ideal: 25% a 45%</p></TooltipContent>
                  </Tooltip>
                </span>
              </div>
            </div>

            {/* Upsell 1 */}
            <div className="rounded-lg bg-blue-500/5 p-3 border border-blue-500/20">
              <div className="flex justify-between items-center">
                <span className="text-sm font-semibold text-foreground">{PRODUCTS.upsell1.label}</span>
                <span className="text-[10px] bg-blue-500/10 text-blue-500 px-2 py-0.5 rounded-full font-medium">Upsell</span>
              </div>
              <div className="flex items-baseline gap-3 mt-2">
                <span className="text-2xl font-bold font-mono-value text-foreground">{totals.vendas_upsell1}</span>
                <span className="text-xs text-muted-foreground">vendas</span>
                <span className="text-xs font-mono-value font-semibold text-kpi-positive ml-auto">{formatCurrency(totals.rev_upsell1)}</span>
              </div>
              <div className="flex items-center justify-between mt-1">
                <span className="text-[11px] text-muted-foreground">
                  {totalVendasFunil > 0 ? ((totals.vendas_upsell1 / totalVendasFunil) * 100).toFixed(1) : 0}% do funil
                </span>
                <span className="text-[11px] text-muted-foreground">
                  <span className="font-mono-value font-medium">{pctUpsell1.toFixed(1)}%</span> das vendas P1
                  <Tooltip>
                    <TooltipTrigger asChild><Info className="h-3 w-3 inline ml-1 cursor-help" /></TooltipTrigger>
                    <TooltipContent><p className="text-xs">Ideal: 10% a 30%</p></TooltipContent>
                  </Tooltip>
                </span>
              </div>
            </div>

            {/* Revenue breakdown */}
            <div className="mt-3 pt-3 border-t border-border text-xs text-center">
              <span className="text-muted-foreground">Total Faturamento:</span>{' '}
              <span className="font-mono-value font-bold text-foreground">{formatCurrency(totalRevenue)}</span>
            </div>
          </div>
        </div>
      </div>

      {/* ─── DIAGNÓSTICO DO FUNIL ─── */}
      <div className="rounded-xl border border-border bg-card p-5">
        <h3 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-kpi-warning" />
          Diagnóstico do Funil
          <span className="text-xs text-muted-foreground font-normal ml-2">Analise onde melhorar baseado nos ideais de mercado</span>
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <DiagnosticCard
            icon={Eye}
            title="Efetividade dos Anúncios"
            value={`CTR ${ctr.toFixed(2)}%`}
            ideal="1,5% para mais"
            tip="Abaixo de 1,5% já precisa começar a gravar novos ads"
            status={diagCtr as any}
          />
          <DiagnosticCard
            icon={MousePointerClick}
            title="Velocidade de Carregamento"
            value={`PV/Cliques ${pvSobreClicks.toFixed(1)}%`}
            ideal="85% a 90%"
            tip="Abaixo de 80% otimizar, mas o ideal é jogar próximo a 90%"
            status={diagPv as any}
          />
          <DiagnosticCard
            icon={FileText}
            title="Melhoria do Copy / Oferta"
            value={`Checkout/PV ${checkoutSobrePv.toFixed(1)}%`}
            ideal="Depende do Funil e Mercado"
            tip="Taxa de conversão da página para checkout"
            status={diagCheckout as any}
          />
          <DiagnosticCard
            icon={ShoppingCart}
            title="Conversão do Checkout"
            value={`${vendasSobreCheckout.toFixed(1)}%`}
            ideal="16% a 20%"
            tip="Conversão do checkout para venda confirmada"
            status={diagConv as any}
          />
          <DiagnosticCard
            icon={Target}
            title="Tx. Conv. Página / Clique"
            value={`${vendasSobreClique.toFixed(2)}%`}
            ideal="2,5% a 4%"
            tip="Vezes que saiu ao menos algum bump"
            status={(vendasSobreClique >= 2.5 ? 'good' : vendasSobreClique >= 1.5 ? 'warn' : 'bad') as any}
          />
          <DiagnosticCard
            icon={BarChart3}
            title="Taxa de Bump"
            value={`${pctBump1.toFixed(1)}%`}
            ideal="25% a 45%"
            tip="Porcentagem de compradores que adicionaram ao menos um bump"
            status={diagBump as any}
          />
          <DiagnosticCard
            icon={TrendingUp}
            title="Taxa de Upsell"
            value={`${pctUpsell1.toFixed(1)}%`}
            ideal="10% a 20%"
            tip="Porcentagem de compradores que adquiriram o upsell"
            status={diagUpsell as any}
          />
        </div>
      </div>

      {/* ─── SIMULADOR DE PROJEÇÃO ─── */}
      <div className="rounded-xl border border-border bg-card p-5">
        <h3 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
          <SlidersHorizontal className="h-4 w-4 text-primary" />
          Simulador de Projeção
          <span className="text-xs text-muted-foreground font-normal ml-2">Altere os valores para simular melhorias no funil</span>
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-5">
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">CTR (atual: {ctr.toFixed(2)}%)</label>
            <div className="flex items-center gap-2">
              <input type="number" step="0.1" min="0" max="100" placeholder={ctr.toFixed(2)}
                value={simCtr} onChange={e => setSimCtr(e.target.value ? Number(e.target.value) : '')}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm font-mono-value focus:outline-none focus:ring-2 focus:ring-ring" />
              <span className="text-sm text-muted-foreground">%</span>
            </div>
            <div className="text-[10px] text-muted-foreground mt-1">Ideal: 1,5%+ (efetividade dos anúncios)</div>
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">PV / Cliques (atual: {pvSobreClicks.toFixed(1)}%)</label>
            <div className="flex items-center gap-2">
              <input type="number" step="1" min="0" max="100" placeholder={pvSobreClicks.toFixed(1)}
                value={simPvClicks} onChange={e => setSimPvClicks(e.target.value ? Number(e.target.value) : '')}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm font-mono-value focus:outline-none focus:ring-2 focus:ring-ring" />
              <span className="text-sm text-muted-foreground">%</span>
            </div>
            <div className="text-[10px] text-muted-foreground mt-1">Ideal: 85-90% (velocidade da página)</div>
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Checkout / PV (atual: {checkoutSobrePv > 0 ? `${checkoutSobrePv.toFixed(1)}%` : '—'})</label>
            <div className="flex items-center gap-2">
              <input type="number" step="1" min="0" max="100" placeholder="30"
                value={simCheckoutPv} onChange={e => setSimCheckoutPv(e.target.value ? Number(e.target.value) : '')}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm font-mono-value focus:outline-none focus:ring-2 focus:ring-ring" />
              <span className="text-sm text-muted-foreground">%</span>
            </div>
            <div className="text-[10px] text-muted-foreground mt-1">Conversão da página</div>
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Conv. Checkout (atual: {vendasSobreCheckout > 0 ? `${vendasSobreCheckout.toFixed(1)}%` : '—'})</label>
            <div className="flex items-center gap-2">
              <input type="number" step="1" min="0" max="100" placeholder="20"
                value={simConvCheckout} onChange={e => setSimConvCheckout(e.target.value ? Number(e.target.value) : '')}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm font-mono-value focus:outline-none focus:ring-2 focus:ring-ring" />
              <span className="text-sm text-muted-foreground">%</span>
            </div>
            <div className="text-[10px] text-muted-foreground mt-1">Ideal: 16-20% (conversão do checkout)</div>
          </div>
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

      {/* ─── TABELA DIÁRIA ─── */}
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="p-4 border-b border-border">
          <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
            <FileText className="h-4 w-4 text-primary" />
            Dados Diários — {MONTH_NAMES[selectedMonth]} {selectedYear}
          </h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-muted/50">
                <th className="px-3 py-2.5 text-left font-semibold text-muted-foreground whitespace-nowrap sticky left-0 bg-muted/50 z-10">Data</th>
                <th className="px-3 py-2.5 text-right font-semibold text-muted-foreground whitespace-nowrap">Invest.</th>
                <th className="px-3 py-2.5 text-right font-semibold text-muted-foreground whitespace-nowrap">Impressões</th>
                <th className="px-3 py-2.5 text-right font-semibold text-muted-foreground whitespace-nowrap">Cliques</th>
                <th className="px-3 py-2.5 text-right font-semibold text-muted-foreground whitespace-nowrap">Pageviews</th>
                <th className="px-3 py-2.5 text-right font-semibold text-muted-foreground whitespace-nowrap">Checkouts</th>
                <th className="px-3 py-2.5 text-right font-semibold text-foreground whitespace-nowrap border-l border-border">Vendas P1</th>
                <th className="px-3 py-2.5 text-right font-semibold text-kpi-warning whitespace-nowrap">Bump</th>
                <th className="px-3 py-2.5 text-right font-semibold text-blue-500 whitespace-nowrap">Upsell</th>
                <th className="px-3 py-2.5 text-right font-semibold text-muted-foreground whitespace-nowrap border-l border-border">CTR</th>
                <th className="px-3 py-2.5 text-right font-semibold text-muted-foreground whitespace-nowrap">CPC</th>
                <th className="px-3 py-2.5 text-right font-semibold text-muted-foreground whitespace-nowrap">PV/Cliq.</th>
                <th className="px-3 py-2.5 text-right font-semibold text-muted-foreground whitespace-nowrap">Chk/PV</th>
                <th className="px-3 py-2.5 text-right font-semibold text-muted-foreground whitespace-nowrap">V/Chk</th>
                <th className="px-3 py-2.5 text-right font-semibold text-muted-foreground whitespace-nowrap">V/Cliq.</th>
                <th className="px-3 py-2.5 text-right font-semibold text-muted-foreground whitespace-nowrap border-l border-border">% Bump</th>
                <th className="px-3 py-2.5 text-right font-semibold text-muted-foreground whitespace-nowrap">% Upsell</th>
                <th className="px-3 py-2.5 text-right font-semibold text-muted-foreground whitespace-nowrap border-l border-border">Conv. Pág.</th>
                <th className="px-3 py-2.5 text-right font-semibold text-muted-foreground whitespace-nowrap">Ticket Médio</th>
                <th className="px-3 py-2.5 text-right font-semibold text-muted-foreground whitespace-nowrap border-l border-border">Total Vendas</th>
                <th className="px-3 py-2.5 text-right font-semibold text-muted-foreground whitespace-nowrap">ROI</th>
                <th className="px-3 py-2.5 text-right font-semibold text-muted-foreground whitespace-nowrap">CPA</th>
                <th className="px-3 py-2.5 text-right font-semibold text-muted-foreground whitespace-nowrap">Lucro</th>
              </tr>
            </thead>
            <tbody>
              {dailyRows.map((row, i) => {
                const dayRev = row.rev_principal + row.rev_bump1 + row.rev_upsell1;
                const dayTotalVendas = row.vendas_principal + row.vendas_bump1 + row.vendas_upsell1;
                const dayRoi = row.spend > 0 ? ((dayRev - row.spend) / row.spend) * 100 : 0;
                const dayCpa = row.vendas_principal > 0 ? row.spend / row.vendas_principal : 0;
                const dayLucro = dayRev - row.spend;
                const dayConvPag = row.pageviews > 0 ? (row.vendas_principal / row.pageviews) * 100 : 0;
                const dayTicket = dayTotalVendas > 0 ? dayRev / dayTotalVendas : 0;
                const dayCtr = row.impressions > 0 ? (row.clicks / row.impressions) * 100 : 0;
                const dayCpc = row.clicks > 0 ? row.spend / row.clicks : 0;
                const dayPvCliq = row.clicks > 0 ? (row.pageviews / row.clicks) * 100 : 0;
                const dayChkPv = row.pageviews > 0 ? (row.checkouts / row.pageviews) * 100 : 0;
                const dayVChk = row.checkouts > 0 ? (row.vendas_principal / row.checkouts) * 100 : 0;
                const dayVCliq = row.clicks > 0 ? (row.vendas_principal / row.clicks) * 100 : 0;
                const dayPctBump = row.vendas_principal > 0 ? (row.vendas_bump1 / row.vendas_principal) * 100 : 0;
                const dayPctUp = row.vendas_principal > 0 ? (row.vendas_upsell1 / row.vendas_principal) * 100 : 0;

                const ctrColor = dayCtr >= 1.5 ? 'text-kpi-positive' : dayCtr >= 1.0 ? 'text-kpi-warning' : 'text-destructive';
                const pvColor = dayPvCliq >= 85 ? 'text-kpi-positive' : dayPvCliq >= 70 ? 'text-kpi-warning' : 'text-destructive';
                const chkColor = dayChkPv >= 20 ? 'text-kpi-positive' : dayChkPv >= 12 ? 'text-kpi-warning' : row.checkouts > 0 ? 'text-destructive' : 'text-muted-foreground';

                return (
                  <tr key={row.date} className={`border-b border-border hover:bg-muted/30 transition-colors ${i % 2 === 0 ? '' : 'bg-muted/10'}`}>
                    <td className="px-3 py-2 font-mono-value whitespace-nowrap sticky left-0 bg-card z-10">{row.date.slice(8)}/{row.date.slice(5, 7)}</td>
                    <td className="px-3 py-2 text-right font-mono-value">{formatCurrency(row.spend)}</td>
                    <td className="px-3 py-2 text-right font-mono-value">{formatNumber(row.impressions)}</td>
                    <td className="px-3 py-2 text-right font-mono-value">{formatNumber(row.clicks)}</td>
                    <td className="px-3 py-2 text-right font-mono-value">{formatNumber(row.pageviews)}</td>
                    <td className="px-3 py-2 text-right font-mono-value">{row.checkouts || '—'}</td>
                    <td className="px-3 py-2 text-right font-mono-value font-semibold border-l border-border">{row.vendas_principal}</td>
                    <td className="px-3 py-2 text-right font-mono-value">{row.vendas_bump1 || '—'}</td>
                    <td className="px-3 py-2 text-right font-mono-value">{row.vendas_upsell1 || '—'}</td>
                    <td className={`px-3 py-2 text-right font-mono-value border-l border-border ${ctrColor}`}>{dayCtr.toFixed(2)}%</td>
                    <td className="px-3 py-2 text-right font-mono-value">{formatCurrency(dayCpc)}</td>
                    <td className={`px-3 py-2 text-right font-mono-value ${pvColor}`}>{dayPvCliq.toFixed(1)}%</td>
                    <td className={`px-3 py-2 text-right font-mono-value ${chkColor}`}>{row.checkouts > 0 ? `${dayChkPv.toFixed(1)}%` : '—'}</td>
                    <td className="px-3 py-2 text-right font-mono-value">{row.checkouts > 0 ? `${dayVChk.toFixed(1)}%` : '—'}</td>
                    <td className="px-3 py-2 text-right font-mono-value">{dayVCliq.toFixed(2)}%</td>
                    <td className="px-3 py-2 text-right font-mono-value border-l border-border">{dayPctBump > 0 ? `${dayPctBump.toFixed(0)}%` : '—'}</td>
                    <td className="px-3 py-2 text-right font-mono-value">{dayPctUp > 0 ? `${dayPctUp.toFixed(0)}%` : '—'}</td>
                    <td className={`px-3 py-2 text-right font-mono-value border-l border-border ${dayConvPag >= 2.5 ? 'text-kpi-positive' : dayConvPag >= 1.5 ? 'text-kpi-warning' : row.pageviews > 0 ? 'text-destructive' : 'text-muted-foreground'}`}>{row.pageviews > 0 ? `${dayConvPag.toFixed(2)}%` : '—'}</td>
                    <td className="px-3 py-2 text-right font-mono-value">{dayTotalVendas > 0 ? formatCurrency(dayTicket) : '—'}</td>
                    <td className="px-3 py-2 text-right font-mono-value font-semibold border-l border-border">{formatCurrency(dayRev)}</td>
                    <td className={`px-3 py-2 text-right font-mono-value font-semibold ${dayRoi >= 0 ? 'text-kpi-positive' : 'text-destructive'}`}>{dayRoi.toFixed(0)}%</td>
                    <td className="px-3 py-2 text-right font-mono-value">{formatCurrency(dayCpa)}</td>
                    <td className={`px-3 py-2 text-right font-mono-value font-semibold ${dayLucro >= 0 ? 'text-kpi-positive' : 'text-destructive'}`}>{formatCurrency(dayLucro)}</td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="bg-muted/60 font-semibold border-t-2 border-border">
                <td className="px-3 py-2.5 sticky left-0 bg-muted/60 z-10">TOTAL</td>
                <td className="px-3 py-2.5 text-right font-mono-value">{formatCurrency(totals.spend)}</td>
                <td className="px-3 py-2.5 text-right font-mono-value">{formatNumber(totals.impressions)}</td>
                <td className="px-3 py-2.5 text-right font-mono-value">{formatNumber(totals.clicks)}</td>
                <td className="px-3 py-2.5 text-right font-mono-value">{formatNumber(totals.pageviews)}</td>
                <td className="px-3 py-2.5 text-right font-mono-value">{totals.checkouts || '—'}</td>
                <td className="px-3 py-2.5 text-right font-mono-value border-l border-border">{totals.vendas_principal}</td>
                <td className="px-3 py-2.5 text-right font-mono-value">{totals.vendas_bump1}</td>
                <td className="px-3 py-2.5 text-right font-mono-value">{totals.vendas_upsell1}</td>
                <td className={`px-3 py-2.5 text-right font-mono-value border-l border-border ${diagCtr === 'good' ? 'text-kpi-positive' : diagCtr === 'warn' ? 'text-kpi-warning' : 'text-destructive'}`}>{ctr.toFixed(2)}%</td>
                <td className="px-3 py-2.5 text-right font-mono-value">{formatCurrency(cpc)}</td>
                <td className={`px-3 py-2.5 text-right font-mono-value ${diagPv === 'good' ? 'text-kpi-positive' : diagPv === 'warn' ? 'text-kpi-warning' : 'text-destructive'}`}>{pvSobreClicks.toFixed(1)}%</td>
                <td className={`px-3 py-2.5 text-right font-mono-value ${diagCheckout === 'good' ? 'text-kpi-positive' : diagCheckout === 'warn' ? 'text-kpi-warning' : 'text-destructive'}`}>{checkoutSobrePv > 0 ? `${checkoutSobrePv.toFixed(1)}%` : '—'}</td>
                <td className="px-3 py-2.5 text-right font-mono-value">{vendasSobreCheckout > 0 ? `${vendasSobreCheckout.toFixed(1)}%` : '—'}</td>
                <td className="px-3 py-2.5 text-right font-mono-value">{vendasSobreClique.toFixed(2)}%</td>
                <td className="px-3 py-2.5 text-right font-mono-value border-l border-border">{pctBump1.toFixed(1)}%</td>
                <td className="px-3 py-2.5 text-right font-mono-value">{pctUpsell1.toFixed(1)}%</td>
                <td className={`px-3 py-2.5 text-right font-mono-value border-l border-border ${vendasSobreClique >= 2.5 ? 'text-kpi-positive' : vendasSobreClique >= 1.5 ? 'text-kpi-warning' : 'text-destructive'}`}>{totals.pageviews > 0 ? `${(totals.vendas_principal / totals.pageviews * 100).toFixed(2)}%` : '—'}</td>
                <td className="px-3 py-2.5 text-right font-mono-value">{totalVendasFunil > 0 ? formatCurrency(totalRevenue / totalVendasFunil) : '—'}</td>
                <td className="px-3 py-2.5 text-right font-mono-value border-l border-border">{formatCurrency(totalRevenue)}</td>
                <td className={`px-3 py-2.5 text-right font-mono-value ${roi >= 0 ? 'text-kpi-positive' : 'text-destructive'}`}>{roi.toFixed(0)}%</td>
                <td className="px-3 py-2.5 text-right font-mono-value">{formatCurrency(cpaReal)}</td>
                <td className={`px-3 py-2.5 text-right font-mono-value ${lucro >= 0 ? 'text-kpi-positive' : 'text-destructive'}`}>{formatCurrency(lucro)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>
  );
}
