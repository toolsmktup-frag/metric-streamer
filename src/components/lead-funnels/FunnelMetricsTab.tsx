import React, { useMemo } from 'react';
import { LeadFunnelStage, Lead, LeadStagePosition } from '@/types/leadFunnels';
import { MetricCard } from '@/components/kpi/MetricCard';
import { Users, DollarSign, TrendingDown, Receipt } from 'lucide-react';
import { formatCurrency, formatPercent } from '@/lib/formatters';
import { isRevenueStage } from '@/lib/revenueStage';

interface Props {
  stages: LeadFunnelStage[];
  positions: (LeadStagePosition & { lead: Lead })[];
}

const FunnelMetricsTab: React.FC<Props> = ({ stages, positions }) => {
  const sortedStages = useMemo(() => [...stages].sort((a, b) => a.sort_order - b.sort_order), [stages]);

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
    </div>
  );
};

export default FunnelMetricsTab;
