import React from 'react';
import { ShoppingCart, Info } from 'lucide-react';
import { formatCurrency } from '@/lib/formatters';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { FUNNEL_PRODUCTS, avgUnitPrice } from '@/lib/classifyTransaction';

const PRODUCTS = FUNNEL_PRODUCTS;

interface Props {
  totals: {
    vendas_principal: number;
    vendas_bump1: number;
    vendas_upsell1: number;
    rev_principal: number;
    rev_bump1: number;
    rev_upsell1: number;
  };
  totalRevenue: number;
}

export function FunnelSalesPanel({ totals, totalRevenue }: Props) {
  const totalVendasFunil = totals.vendas_principal + totals.vendas_bump1 + totals.vendas_upsell1;
  const pctBump1 = totals.vendas_principal > 0 ? (totals.vendas_bump1 / totals.vendas_principal) * 100 : 0;
  const pctUpsell1 = totals.vendas_principal > 0 ? (totals.vendas_upsell1 / totals.vendas_principal) * 100 : 0;

  return (
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
            <span className="text-[11px] text-muted-foreground">{formatCurrency(avgUnitPrice(totals.rev_principal, totals.vendas_principal))}/un</span>
          </div>
        </div>

        {/* Bump */}
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

        {/* Upsell */}
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

        <div className="mt-3 pt-3 border-t border-border text-xs text-center">
          <span className="text-muted-foreground">Total Faturamento:</span>{' '}
          <span className="font-mono-value font-bold text-foreground">{formatCurrency(totalRevenue)}</span>
        </div>
      </div>
    </div>
  );
}
