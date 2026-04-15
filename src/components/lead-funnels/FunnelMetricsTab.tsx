import React, { useMemo } from 'react';
import { LeadFunnelStage, Lead, LeadStagePosition } from '@/types/leadFunnels';
import { MetricCard } from '@/components/kpi/MetricCard';
import { Users, DollarSign, TrendingDown, Receipt, Package, Eye, MousePointerClick, Mail, Globe, LucideIcon } from 'lucide-react';
import { formatCurrency, formatPercent } from '@/lib/formatters';
import { isRevenueStage } from '@/lib/revenueStage';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

interface Props {
  stages: LeadFunnelStage[];
  positions: (LeadStagePosition & { lead: Lead })[];
  funnelId: string;
}

const FunnelMetricsTab: React.FC<Props> = ({ stages, positions, funnelId }) => {
  const sortedStages = useMemo(() => [...stages].sort((a, b) => a.sort_order - b.sort_order), [stages]);

  // Fetch tracking metrics from clicks table
  const { data: trackingMetrics } = useQuery({
    queryKey: ['funnel-tracking-metrics', funnelId],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('clicks')
        .select('event_type, visitor_id, email, page_url, stage_id, created_at')
        .eq('funnel_id', funnelId);

      if (error) {
        console.error('Error fetching tracking metrics:', error);
        return { pageviews: 0, uniqueVisitors: 0, emailCaptures: 0, uniquePages: 0, stageViews: new Map<string, number>() };
      }

      const rows = (data || []) as any[];
      const pageviews = rows.filter(r => r.event_type === 'pageview').length;
      const uniqueVisitors = new Set(rows.map(r => r.visitor_id)).size;
      const emailCaptures = rows.filter(r => r.event_type === 'email_capture').length;
      const uniquePages = new Set(rows.filter(r => r.page_url).map(r => r.page_url)).size;

      // Stage-level views
      const stageViews = new Map<string, number>();
      for (const row of rows) {
        if (row.event_type === 'pageview' && row.stage_id) {
          stageViews.set(row.stage_id, (stageViews.get(row.stage_id) || 0) + 1);
        }
      }

      return { pageviews, uniqueVisitors, emailCaptures, uniquePages, stageViews };
    },
    refetchInterval: 30000,
  });

  const metrics = useMemo(() => {
    let confirmedRevenue = 0;
    let lostRevenue = 0;
    let revenueLeadCount = 0;

    const stageMap = new Map(stages.map(s => [s.id, s]));

    for (const pos of positions) {
      const stage = stageMap.get(pos.stage_id);
      const amount = Number(pos.lead.metadata?.amount) || 0;
      if (stage && isRevenueStage(stage.name)) {
        confirmedRevenue += amount;
        if (amount > 0) revenueLeadCount++;
      } else {
        lostRevenue += amount;
      }
    }

    const avgTicket = revenueLeadCount > 0 ? confirmedRevenue / revenueLeadCount : 0;

    return { confirmedRevenue, lostRevenue, avgTicket, revenueLeadCount, totalLeads: positions.length };
  }, [stages, positions]);

  const stageStats = useMemo(() => {
    return sortedStages.map(stage => {
      const stagePositions = positions.filter(p => p.stage_id === stage.id);
      const revenue = stagePositions.reduce((sum, p) => sum + (Number(p.lead.metadata?.amount) || 0), 0);
      const isRevenue = isRevenueStage(stage.name);
      return { stage, count: stagePositions.length, revenue, isRevenue };
    });
  }, [sortedStages, positions]);

  const maxCount = Math.max(...stageStats.map(s => s.count), 1);

  // Conversion rates between adjacent stages
  const conversionRates = useMemo(() => {
    if (stageStats.length < 2) return [];
    return stageStats.slice(1).map((curr, i) => {
      const prev = stageStats[i];
      const rate = prev.count > 0 ? (curr.count / prev.count) * 100 : 0;
      return { from: prev.stage.name, to: curr.stage.name, rate };
    });
  }, [stageStats]);

  return (
    <div className="space-y-6">
      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <MetricCard
          label="Total de Leads"
          value={metrics.totalLeads.toLocaleString('pt-BR')}
          icon={Users}
          color="bg-primary/10 text-primary"
        />
        <MetricCard
          label="Receita Confirmada"
          value={formatCurrency(metrics.confirmedRevenue)}
          sub={`${metrics.revenueLeadCount} compradores`}
          icon={DollarSign}
          color="bg-emerald-500/10 text-emerald-600"
        />
        <MetricCard
          label="Perdido (na mesa)"
          value={formatCurrency(metrics.lostRevenue)}
          icon={TrendingDown}
          color="bg-destructive/10 text-destructive"
        />
        <MetricCard
          label="Ticket Médio"
          value={formatCurrency(metrics.avgTicket)}
          icon={Receipt}
          color="bg-amber-500/10 text-amber-600"
        />
      </div>

      {/* Tracking Metrics */}
      {trackingMetrics && trackingMetrics.pageviews > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <MetricCard
            label="Pageviews"
            value={trackingMetrics.pageviews.toLocaleString('pt-BR')}
            icon={Eye}
            color="bg-blue-500/10 text-blue-600"
          />
          <MetricCard
            label="Visitantes Únicos"
            value={trackingMetrics.uniqueVisitors.toLocaleString('pt-BR')}
            icon={Globe}
            color="bg-indigo-500/10 text-indigo-600"
          />
          <MetricCard
            label="Emails Capturados"
            value={trackingMetrics.emailCaptures.toLocaleString('pt-BR')}
            icon={Mail}
            color="bg-violet-500/10 text-violet-600"
          />
          <MetricCard
            label="Taxa Captura"
            value={trackingMetrics.uniqueVisitors > 0 ? formatPercent((trackingMetrics.emailCaptures / trackingMetrics.uniqueVisitors) * 100) : '0%'}
            sub={`${trackingMetrics.uniquePages} páginas rastreadas`}
            icon={MousePointerClick}
            color="bg-cyan-500/10 text-cyan-600"
          />
        </div>
      )}

      {/* Distribution by stage */}
      <div className="rounded-xl border border-border bg-card p-5">
        <h3 className="text-sm font-semibold text-foreground mb-4">Distribuição por Etapa</h3>
        <div className="space-y-3">
          {stageStats.map(({ stage, count, revenue, isRevenue }) => (
            <div key={stage.id} className="flex items-center gap-3">
              <span
                className="h-3 w-3 rounded-full shrink-0"
                style={{ backgroundColor: stage.color }}
              />
              <span className="text-sm font-medium text-foreground w-36 truncate">{stage.name}</span>
              <div className="flex-1 h-6 bg-muted rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all"
                  style={{
                    width: `${(count / maxCount) * 100}%`,
                    backgroundColor: stage.color,
                    minWidth: count > 0 ? '8px' : '0',
                  }}
                />
              </div>
              <span className="text-sm font-mono text-foreground w-12 text-right">{count}</span>
              {trackingMetrics?.stageViews?.get(stage.id) != null && (
                <span className="text-[11px] text-muted-foreground w-16 text-right" title="Pageviews do tracking">
                  <Eye className="inline h-3 w-3 mr-0.5" />{trackingMetrics.stageViews.get(stage.id)}
                </span>
              )}
              {revenue > 0 && (
                <span className={`text-xs font-semibold w-28 text-right ${isRevenue ? 'text-emerald-600 dark:text-emerald-400' : 'text-destructive'}`}>
                  {isRevenue ? '' : '-'}{formatCurrency(revenue)}
                </span>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Conversion rates */}
      {conversionRates.length > 0 && (
        <div className="rounded-xl border border-border bg-card p-5">
          <h3 className="text-sm font-semibold text-foreground mb-4">Taxa de Conversão entre Etapas</h3>
          <div className="space-y-2">
            {conversionRates.map((cr, i) => (
              <div key={i} className="flex items-center gap-3 text-sm">
                <span className="text-muted-foreground">{cr.from}</span>
                <span className="text-muted-foreground">→</span>
                <span className="text-foreground font-medium">{cr.to}</span>
                <span className={`ml-auto font-bold font-mono ${cr.rate >= 50 ? 'text-emerald-600 dark:text-emerald-400' : cr.rate >= 20 ? 'text-amber-600 dark:text-amber-400' : 'text-destructive'}`}>
                  {formatPercent(cr.rate)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* UTM Breakdowns */}
      <UtmBreakdown positions={positions} field="utm_source" label="Fontes (utm_source)" icon={Globe} />
      <UtmBreakdown positions={positions} field="utm_medium" label="Mídia (utm_medium)" icon={MousePointerClick} />
      <UtmBreakdown positions={positions} field="utm_campaign" label="Campanhas (utm_campaign)" icon={Package} />
      <UtmBreakdown positions={positions} field="utm_content" label="Criativos (utm_content)" icon={Eye} />

      {/* Top Products */}
      <ProductsRanking positions={positions} stages={stages} />
    </div>
  );
};

/* ---- UTM Breakdown Sub-component ---- */
const UtmBreakdown: React.FC<{
  positions: (LeadStagePosition & { lead: Lead })[];
  field: 'utm_source' | 'utm_medium' | 'utm_campaign' | 'utm_content';
  label: string;
  icon: LucideIcon;
}> = ({ positions, field, label, icon: Icon }) => {
  const items = useMemo(() => {
    const map = new Map<string, number>();
    for (const pos of positions) {
      const val = (pos.lead[field] as string)?.trim();
      if (!val) continue;
      map.set(val, (map.get(val) || 0) + 1);
    }
    return Array.from(map.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 15);
  }, [positions, field]);

  const maxCount = Math.max(...items.map(i => i.count), 1);
  const total = items.reduce((s, i) => s + i.count, 0);

  if (items.length === 0) return null;

  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <div className="flex items-center gap-2 mb-4">
        <Icon className="h-4 w-4 text-foreground" />
        <h3 className="text-sm font-semibold text-foreground">{label}</h3>
        <span className="text-xs text-muted-foreground ml-auto">{total} leads com dados</span>
      </div>
      <div className="space-y-2">
        {items.map((item) => (
          <div key={item.name} className="flex items-center gap-3">
            <span className="text-sm font-medium text-foreground w-52 truncate" title={item.name}>{item.name}</span>
            <div className="flex-1 h-5 bg-muted rounded-full overflow-hidden">
              <div
                className="h-full rounded-full bg-primary/60 transition-all"
                style={{ width: `${(item.count / maxCount) * 100}%`, minWidth: item.count > 0 ? '6px' : '0' }}
              />
            </div>
            <span className="text-sm font-mono text-foreground w-10 text-right">{item.count}</span>
            <span className="text-xs text-muted-foreground w-12 text-right">
              {total > 0 ? `${((item.count / total) * 100).toFixed(0)}%` : '0%'}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
};

/* ---- Products Ranking Sub-component ---- */
interface ProductStat {
  name: string;
  count: number;
  revenue: number;
}

const ProductsRanking: React.FC<{ positions: (LeadStagePosition & { lead: Lead })[]; stages: LeadFunnelStage[] }> = ({ positions, stages }) => {
  const stageMap = useMemo(() => new Map(stages.map(s => [s.id, s])), [stages]);

  const products = useMemo(() => {
    const map = new Map<string, ProductStat>();
    for (const pos of positions) {
      const productName = (pos.lead.metadata?.product_name as string)?.trim();
      if (!productName) continue;
      const existing = map.get(productName) || { name: productName, count: 0, revenue: 0 };
      existing.count += 1;
      const amount = Number(pos.lead.metadata?.amount) || 0;
      const stage = stageMap.get(pos.stage_id);
      if (stage && isRevenueStage(stage.name)) {
        existing.revenue += amount;
      }
      map.set(productName, existing);
    }
    return Array.from(map.values())
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);
  }, [positions, stageMap]);

  const maxCount = Math.max(...products.map(p => p.count), 1);

  if (products.length === 0) return null;

  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <div className="flex items-center gap-2 mb-4">
        <Package className="h-4 w-4 text-foreground" />
        <h3 className="text-sm font-semibold text-foreground">Produtos Mais Vendidos</h3>
      </div>
      <div className="space-y-3">
        {products.map((p) => (
          <div key={p.name} className="flex items-center gap-3">
            <span className="text-sm font-medium text-foreground w-44 truncate" title={p.name}>{p.name}</span>
            <div className="flex-1 h-6 bg-muted rounded-full overflow-hidden">
              <div
                className="h-full rounded-full bg-primary/70 transition-all"
                style={{ width: `${(p.count / maxCount) * 100}%`, minWidth: p.count > 0 ? '8px' : '0' }}
              />
            </div>
            <span className="text-sm font-mono text-foreground w-10 text-right">{p.count}</span>
            {p.revenue > 0 && (
              <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 w-28 text-right">
                {formatCurrency(p.revenue)}
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

export default FunnelMetricsTab;
