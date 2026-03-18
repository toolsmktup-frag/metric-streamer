import React, { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { formatCurrency, formatNumber, formatPercent } from '@/lib/formatters';
import { SkeletonCard } from '@/components/dashboard/SkeletonCard';
import {
  TrendingUp, DollarSign, Eye, MousePointerClick,
  FileText, ShoppingCart, Target, BarChart3, Calculator, Gauge,
  ChevronLeft, ChevronRight, AlertTriangle,
  Users, Globe, FileImage, Smartphone,
} from 'lucide-react';

import { classifyTransaction, FUNNEL_PRODUCTS, avgUnitPrice } from '@/lib/classifyTransaction';
import { MetricCard } from '@/components/kpi/MetricCard';
import { DiagnosticCard } from '@/components/kpi/DiagnosticCard';
import { FunnelStep } from '@/components/kpi/FunnelStep';
import { FunnelSalesPanel } from '@/components/kpi/FunnelSalesPanel';
import { ProjectionSimulator } from '@/components/kpi/ProjectionSimulator';
import { DailyTable } from '@/components/kpi/DailyTable';
import DemograficosSection from '@/components/geral-ads/DemograficosSection';
import GeograficoSection from '@/components/geral-ads/GeograficoSection';
import CriativosSection from '@/components/geral-ads/CriativosSection';
import DispositivosSection from '@/components/geral-ads/DispositivosSection';

const PRODUCTS = FUNNEL_PRODUCTS;

function getActionValue(actions: any[] | null, actionType: string): number {
  if (!actions || !Array.isArray(actions)) return 0;
  const action = actions.find((a: any) =>
    a.action_type === actionType ||
    a.action_type === `offsite_conversion.fb_pixel_${actionType}`
  );
  return action ? Number(action.value) : 0;
}

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

export default function KpiGeral() {
  const now = new Date();
  const [selectedYear, setSelectedYear] = useState(now.getFullYear());
  const [selectedMonth, setSelectedMonth] = useState(now.getMonth());

  const { start: dateFrom, end: dateTo } = getMonthRange(selectedYear, selectedMonth);
  const allDays = getDaysInMonth(selectedYear, selectedMonth);

  const { data: metaInsights = [], isLoading: loadingMeta } = useQuery({
    queryKey: ['kpi-meta-insights', dateFrom, dateTo],
    queryFn: async () => {
      let all: any[] = [];
      let from = 0;
      const pageSize = 1000;
      while (true) {
        const { data } = await supabase
          .from('meta_insights')
          .select('*')
          .eq('object_type', 'campaign')
          .gte('date_start', dateFrom)
          .lte('date_start', dateTo)
          .range(from, from + pageSize - 1);
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

  const { data: transactions = [], isLoading: loadingTicto } = useQuery({
    queryKey: ['kpi-ticto', dateFrom, dateTo],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('ticto_transactions')
        .select('*')
        .gte('order_date', `${dateFrom}T00:00:00`)
        .lte('order_date', `${dateTo}T23:59:59`)
        .order('order_date', { ascending: false });
      if (error) throw error;
      return data || [];
    },
    staleTime: 2 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  });

  const approved = useMemo(() => transactions.filter((t: any) => t.status === 'authorized'), [transactions]);

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

  const diagCtr = ctr >= 1.5 ? 'good' : ctr >= 1.0 ? 'warn' : 'bad';
  const diagPv = pvSobreClicks >= 85 ? 'good' : pvSobreClicks >= 70 ? 'warn' : 'bad';
  const diagCheckout = checkoutSobrePv >= 20 ? 'good' : checkoutSobrePv >= 12 ? 'warn' : 'bad';
  const diagConv = vendasSobreCheckout >= 16 ? 'good' : vendasSobreCheckout >= 10 ? 'warn' : 'bad';
  const diagBump = pctBump1 >= 25 ? 'good' : pctBump1 >= 15 ? 'warn' : 'bad';
  const diagUpsell = pctUpsell1 >= 10 ? 'good' : pctUpsell1 >= 5 ? 'warn' : 'bad';

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
        <h1 className="text-2xl font-bold text-foreground">KPI Geral</h1>
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
        <h1 className="text-2xl font-bold text-foreground">KPI Geral</h1>
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

      {/* TOP KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4">
        <MetricCard label="Investimento" value={formatCurrency(totals.spend)} sub={`${formatCurrency(investDiario)}/dia`} icon={DollarSign} color="bg-destructive/10 text-destructive" />
        <MetricCard label="Faturamento" value={formatCurrency(totalRevenue)} icon={TrendingUp} color="bg-kpi-positive/10 text-kpi-positive" />
        <MetricCard label="Lucro" value={formatCurrency(lucro)} sub={`${formatCurrency(lucroDiario)}/dia`} icon={BarChart3} color={lucro >= 0 ? 'bg-kpi-positive/10 text-kpi-positive' : 'bg-destructive/10 text-destructive'} />
        <MetricCard label="ROI" value={`${roi.toFixed(0)}%`} icon={Target} color={roi >= 0 ? 'bg-kpi-positive/10 text-kpi-positive' : 'bg-destructive/10 text-destructive'} />
        <MetricCard label="ACV" value={formatCurrency(acv)} sub="Valor médio / cliente" icon={ShoppingCart} />
        <MetricCard label="CPA Real" value={formatCurrency(cpaReal)} sub={`${vendasDia.toFixed(1)} vendas/dia`} icon={Calculator} />
      </div>

      {/* FUNIL DE CONVERSÃO VISUAL */}
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

        <FunnelSalesPanel totals={totals} totalRevenue={totalRevenue} />
      </div>

      {/* DIAGNÓSTICO DO FUNIL */}
      <div className="rounded-xl border border-border bg-card p-5">
        <h3 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-kpi-warning" />
          Diagnóstico do Funil
          <span className="text-xs text-muted-foreground font-normal ml-2">Analise onde melhorar baseado nos ideais de mercado</span>
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <DiagnosticCard icon={Eye} title="Efetividade dos Anúncios" value={`CTR ${ctr.toFixed(2)}%`} ideal="1,5% para mais" tip="Abaixo de 1,5% já precisa começar a gravar novos ads" status={diagCtr as any} />
          <DiagnosticCard icon={MousePointerClick} title="Velocidade de Carregamento" value={`PV/Cliques ${pvSobreClicks.toFixed(1)}%`} ideal="85% a 90%" tip="Abaixo de 80% otimizar, mas o ideal é jogar próximo a 90%" status={diagPv as any} />
          <DiagnosticCard icon={FileText} title="Melhoria do Copy / Oferta" value={`Checkout/PV ${checkoutSobrePv.toFixed(1)}%`} ideal="Depende do Funil e Mercado" tip="Taxa de conversão da página para checkout" status={diagCheckout as any} />
          <DiagnosticCard icon={ShoppingCart} title="Conversão do Checkout" value={`${vendasSobreCheckout.toFixed(1)}%`} ideal="16% a 20%" tip="Conversão do checkout para venda confirmada" status={diagConv as any} />
          <DiagnosticCard icon={Target} title="Tx. Conv. Página / Clique" value={`${vendasSobreClique.toFixed(2)}%`} ideal="2,5% a 4%" tip="Vezes que saiu ao menos algum bump" status={(vendasSobreClique >= 2.5 ? 'good' : vendasSobreClique >= 1.5 ? 'warn' : 'bad') as any} />
          <DiagnosticCard icon={BarChart3} title="Taxa de Bump" value={`${pctBump1.toFixed(1)}%`} ideal="25% a 45%" tip="Porcentagem de compradores que adicionaram ao menos um bump" status={diagBump as any} />
          <DiagnosticCard icon={TrendingUp} title="Taxa de Upsell" value={`${pctUpsell1.toFixed(1)}%`} ideal="10% a 20%" tip="Porcentagem de compradores que adquiriram o upsell" status={diagUpsell as any} />
        </div>
      </div>

      {/* SIMULADOR */}
      <ProjectionSimulator
        totals={totals}
        ctr={ctr}
        pvSobreClicks={pvSobreClicks}
        checkoutSobrePv={checkoutSobrePv}
        vendasSobreCheckout={vendasSobreCheckout}
        totalRevenue={totalRevenue}
        acv={acv}
      />

      {/* TABELA DIÁRIA */}
      <DailyTable
        dailyRows={dailyRows}
        totals={totals}
        monthLabel={`${MONTH_NAMES[selectedMonth]} ${selectedYear}`}
      />

      {/* SEÇÕES DETALHADAS */}
      <div className="border-t border-border pt-6">
        <DemograficosSection />
      </div>

      <div className="border-t border-border pt-6">
        <GeograficoSection />
      </div>

      <div className="border-t border-border pt-6">
        <CriativosSection />
      </div>

      <div className="border-t border-border pt-6">
        <DispositivosSection />
      </div>
    </div>
  );
}
