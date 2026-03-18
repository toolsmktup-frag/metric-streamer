import React, { useMemo } from 'react';
import { formatCurrency } from '@/lib/formatters';
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from '@/components/ui/tooltip';
import type { RFMCustomer } from '@/hooks/useRFM';

interface Props {
  customers: RFMCustomer[];
}

/**
 * Classic 5×5 RFM Heatmap.
 * Y-axis: Recency score (5 at top = most recent).
 * X-axis: Combined F+M score (avg of fScore + mScore, bucketed 1–5).
 */
export default function RFMHeatmap({ customers }: Props) {
  const grid = useMemo(() => {
    // Build 5x5 grid: grid[r][fm] = { count, totalRevenue }
    const cells: Record<string, { count: number; totalRevenue: number; avgMonetary: number }> = {};
    let maxCount = 0;

    for (const c of customers) {
      const r = c.rScore; // 1-5
      const fm = Math.round((c.fScore + c.mScore) / 2); // 1-5
      const key = `${r}-${fm}`;
      if (!cells[key]) cells[key] = { count: 0, totalRevenue: 0, avgMonetary: 0 };
      cells[key].count++;
      cells[key].totalRevenue += c.monetary;
    }

    // Compute avg and find max
    for (const key of Object.keys(cells)) {
      const cell = cells[key];
      cell.avgMonetary = cell.count > 0 ? cell.totalRevenue / cell.count : 0;
      if (cell.count > maxCount) maxCount = cell.count;
    }

    return { cells, maxCount };
  }, [customers]);

  const rLabels = ['Hibernando', 'Em risco', 'Precisa atenção', 'Ativo', 'Recente'];
  const fmLabels = ['Baixo', 'Abaixo da média', 'Médio', 'Acima da média', 'Alto'];

  function getCellColor(count: number, maxCount: number): string {
    if (count === 0 || maxCount === 0) return 'bg-muted/30';
    const ratio = count / maxCount;
    if (ratio > 0.7) return 'bg-emerald-600 text-white';
    if (ratio > 0.5) return 'bg-emerald-500 text-white';
    if (ratio > 0.3) return 'bg-emerald-400 text-white';
    if (ratio > 0.15) return 'bg-emerald-300 text-emerald-900 dark:bg-emerald-700 dark:text-emerald-100';
    if (ratio > 0.05) return 'bg-emerald-200 text-emerald-800 dark:bg-emerald-800 dark:text-emerald-200';
    return 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300';
  }

  return (
    <TooltipProvider>
      <div className="p-4">
        <div className="flex">
          {/* Y-axis label */}
          <div className="flex flex-col items-center justify-center mr-2">
            <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider [writing-mode:vertical-lr] rotate-180">
              Recência →
            </span>
          </div>

          <div className="flex-1">
            {/* Grid rows: R=5 at top, R=1 at bottom */}
            <div className="space-y-1">
              {[5, 4, 3, 2, 1].map((r) => (
                <div key={r} className="flex items-center gap-1">
                  <span className="w-24 text-right text-[10px] text-muted-foreground font-medium pr-2 shrink-0">
                    {rLabels[r - 1]}
                  </span>
                  {[1, 2, 3, 4, 5].map((fm) => {
                    const key = `${r}-${fm}`;
                    const cell = grid.cells[key] || { count: 0, totalRevenue: 0, avgMonetary: 0 };
                    return (
                      <Tooltip key={key}>
                        <TooltipTrigger asChild>
                          <div
                            className={`flex-1 aspect-square min-h-[48px] rounded-lg flex flex-col items-center justify-center cursor-default transition-all hover:scale-105 hover:shadow-md ${getCellColor(cell.count, grid.maxCount)}`}
                          >
                            <span className="text-sm font-bold">{cell.count}</span>
                            {cell.count > 0 && (
                              <span className="text-[9px] opacity-80">{formatCurrency(cell.avgMonetary)}</span>
                            )}
                          </div>
                        </TooltipTrigger>
                        <TooltipContent side="top" className="max-w-[200px]">
                          <div className="text-xs space-y-1">
                            <p className="font-semibold">R={r} · F+M={fm}</p>
                            <p>{cell.count} clientes</p>
                            {cell.count > 0 && (
                              <>
                                <p>Receita total: {formatCurrency(cell.totalRevenue)}</p>
                                <p>Ticket médio: {formatCurrency(cell.avgMonetary)}</p>
                              </>
                            )}
                          </div>
                        </TooltipContent>
                      </Tooltip>
                    );
                  })}
                </div>
              ))}
            </div>

            {/* X-axis labels */}
            <div className="flex mt-2 ml-24">
              {fmLabels.map((label, i) => (
                <div key={i} className="flex-1 text-center">
                  <span className="text-[10px] text-muted-foreground font-medium">{label}</span>
                </div>
              ))}
            </div>
            <div className="text-center mt-1 ml-24">
              <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                Frequência + Monetário →
              </span>
            </div>
          </div>
        </div>

        {/* Color legend */}
        <div className="flex items-center justify-center gap-2 mt-4 text-[10px] text-muted-foreground">
          <span>Menos clientes</span>
          <div className="flex gap-0.5">
            {['bg-emerald-50 dark:bg-emerald-950/40', 'bg-emerald-200 dark:bg-emerald-800', 'bg-emerald-300 dark:bg-emerald-700', 'bg-emerald-400', 'bg-emerald-500', 'bg-emerald-600'].map((c, i) => (
              <div key={i} className={`w-5 h-3 rounded-sm ${c}`} />
            ))}
          </div>
          <span>Mais clientes</span>
        </div>
      </div>
    </TooltipProvider>
  );
}
