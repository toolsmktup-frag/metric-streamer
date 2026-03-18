import React from 'react';
import { FileText } from 'lucide-react';
import { formatCurrency, formatNumber } from '@/lib/formatters';

interface DailyRow {
  date: string;
  spend: number;
  impressions: number;
  clicks: number;
  pageviews: number;
  checkouts: number;
  vendas_principal: number;
  vendas_bump1: number;
  vendas_upsell1: number;
  rev_principal: number;
  rev_bump1: number;
  rev_upsell1: number;
}

interface Totals {
  spend: number; impressions: number; clicks: number; pageviews: number; checkouts: number;
  vendas_principal: number; vendas_bump1: number; vendas_upsell1: number;
  rev_principal: number; rev_bump1: number; rev_upsell1: number;
}

interface Props {
  dailyRows: DailyRow[];
  totals: Totals;
  monthLabel: string;
}

export function DailyTable({ dailyRows, totals, monthLabel }: Props) {
  const totalVendasFunil = totals.vendas_principal + totals.vendas_bump1 + totals.vendas_upsell1;
  const totalRevenue = totals.rev_principal + totals.rev_bump1 + totals.rev_upsell1;
  const ctr = totals.impressions > 0 ? (totals.clicks / totals.impressions) * 100 : 0;
  const cpc = totals.clicks > 0 ? totals.spend / totals.clicks : 0;
  const pvSobreClicks = totals.clicks > 0 ? (totals.pageviews / totals.clicks) * 100 : 0;
  const checkoutSobrePv = totals.pageviews > 0 ? (totals.checkouts / totals.pageviews) * 100 : 0;
  const vendasSobreCheckout = totals.checkouts > 0 ? (totals.vendas_principal / totals.checkouts) * 100 : 0;
  const vendasSobreClique = totals.clicks > 0 ? (totals.vendas_principal / totals.clicks) * 100 : 0;
  const pctBump1 = totals.vendas_principal > 0 ? (totals.vendas_bump1 / totals.vendas_principal) * 100 : 0;
  const pctUpsell1 = totals.vendas_principal > 0 ? (totals.vendas_upsell1 / totals.vendas_principal) * 100 : 0;
  const roi = totals.spend > 0 ? ((totalRevenue - totals.spend) / totals.spend) * 100 : 0;
  const lucro = totalRevenue - totals.spend;
  const cpaReal = totals.vendas_principal > 0 ? totals.spend / totals.vendas_principal : 0;

  const diagCtr = ctr >= 1.5 ? 'good' : ctr >= 1.0 ? 'warn' : 'bad';
  const diagPv = pvSobreClicks >= 85 ? 'good' : pvSobreClicks >= 70 ? 'warn' : 'bad';
  const diagCheckout = checkoutSobrePv >= 20 ? 'good' : checkoutSobrePv >= 12 ? 'warn' : 'bad';

  const statusColor = (s: string) => s === 'good' ? 'text-kpi-positive' : s === 'warn' ? 'text-kpi-warning' : 'text-destructive';

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      <div className="p-4 border-b border-border">
        <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
          <FileText className="h-4 w-4 text-primary" />
          Dados Diários — {monthLabel}
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
              <td className={`px-3 py-2.5 text-right font-mono-value border-l border-border ${statusColor(diagCtr)}`}>{ctr.toFixed(2)}%</td>
              <td className="px-3 py-2.5 text-right font-mono-value">{formatCurrency(cpc)}</td>
              <td className={`px-3 py-2.5 text-right font-mono-value ${statusColor(diagPv)}`}>{pvSobreClicks.toFixed(1)}%</td>
              <td className={`px-3 py-2.5 text-right font-mono-value ${statusColor(diagCheckout)}`}>{checkoutSobrePv > 0 ? `${checkoutSobrePv.toFixed(1)}%` : '—'}</td>
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
  );
}
