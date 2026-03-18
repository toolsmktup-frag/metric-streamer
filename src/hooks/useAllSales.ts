import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useFilterStore } from '@/stores/filterStore';
import type { SalesAggregation } from './useTictoData';

function toLocalDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

const SHARED_QUERY_OPTIONS = {
  staleTime: 30 * 1000,
  gcTime: 5 * 60 * 1000,
  refetchOnWindowFocus: true,
  refetchOnMount: true,
} as const;

/** Linha normalizada da view v_all_sales — revenue em reais, sem centavos */
export interface UnifiedSale {
  id: string;
  platform: string;
  funnel_id: string | null;
  status: string;
  purchased_at: string;
  revenue: number;
  product_name: string | null;
  offer_name: string | null;
  payment_method: string | null;
  customer_name: string | null;
  customer_email: string | null;
  meta_campaign_id: string | null;
  meta_adset_id: string | null;
  meta_ad_id: string | null;
  meta_campaign_name: string | null;
  meta_adset_name: string | null;
  meta_ad_name: string | null;
  utm_source: string | null;
  utm_campaign: string | null;
  utm_medium: string | null;
  utm_content: string | null;
  is_paid_traffic: boolean;
}

/**
 * Busca todas as vendas (Ticto + Guru + Eduzz + ...) via view v_all_sales.
 * Passe funnelId para filtrar por funil específico.
 */
export function useAllSales(funnelId?: string | null) {
  const { dateRange } = useFilterStore();
  const dateFrom = toLocalDate(dateRange.start);
  const dateTo = toLocalDate(dateRange.end);

  return useQuery({
    queryKey: ['all-sales', dateFrom, dateTo, funnelId ?? 'all'],
    queryFn: async () => {
      let query = (supabase as any)
        .from('v_all_sales')
        .select('*')
        .gte('purchased_at', `${dateFrom}T00:00:00`)
        .lte('purchased_at', `${dateTo}T23:59:59`)
        .order('purchased_at', { ascending: false });

      if (funnelId) {
        query = query.eq('funnel_id', funnelId);
      }

      const { data, error } = await query;
      if (error) throw error;
      return (data || []) as UnifiedSale[];
    },
    ...SHARED_QUERY_OPTIONS,
  });
}

function emptySalesAgg(): SalesAggregation {
  return {
    sales_count: 0, revenue: 0,
    front_sales: 0, front_revenue: 0,
    bump_sales: 0, bump_revenue: 0,
    upsell_sales: 0, upsell_revenue: 0,
  };
}

// Use shared classification
import { classifyTransaction as classifySale } from '@/lib/classifyTransaction';

/**
 * Agrega vendas de todas as plataformas por campanha / adset / ad.
 * Substitui useSalesAggregation para o Resumo Geral e páginas de funil.
 */
export function useAllSalesAggregation(funnelId?: string | null) {
  const { data: allSales = [] } = useAllSales(funnelId);
  const confirmed = allSales.filter(t => t.status === 'authorized');

  const byCampaign: Record<string, SalesAggregation> = {};
  const byAdset: Record<string, SalesAggregation> = {};
  const byAd: Record<string, SalesAggregation> = {};

  function addToAgg(agg: SalesAggregation, revenue: number, type: string) {
    agg.sales_count++;
    agg.revenue += revenue;
    if (type === 'principal')  { agg.front_sales++;  agg.front_revenue  += revenue; }
    else if (type === 'bump1') { agg.bump_sales++;   agg.bump_revenue   += revenue; }
    else if (type === 'upsell1') { agg.upsell_sales++; agg.upsell_revenue += revenue; }
  }

  for (const tx of confirmed) {
    const type = classifySale(tx);
    if (tx.meta_campaign_id) {
      if (!byCampaign[tx.meta_campaign_id]) byCampaign[tx.meta_campaign_id] = emptySalesAgg();
      addToAgg(byCampaign[tx.meta_campaign_id], tx.revenue, type);
    }
    if (tx.meta_adset_id) {
      if (!byAdset[tx.meta_adset_id]) byAdset[tx.meta_adset_id] = emptySalesAgg();
      addToAgg(byAdset[tx.meta_adset_id], tx.revenue, type);
    }
    if (tx.meta_ad_id) {
      if (!byAd[tx.meta_ad_id]) byAd[tx.meta_ad_id] = emptySalesAgg();
      addToAgg(byAd[tx.meta_ad_id], tx.revenue, type);
    }
  }

  const organicSales = emptySalesAgg();
  const organicTransactions = confirmed.filter(t => !t.is_paid_traffic);
  for (const tx of organicTransactions) {
    addToAgg(organicSales, tx.revenue, classifySale(tx));
  }

  const totalSales = emptySalesAgg();
  for (const tx of confirmed) {
    addToAgg(totalSales, tx.revenue, classifySale(tx));
  }

  return { byCampaign, byAdset, byAd, organicSales, totalSales, organicTransactions };
}

/** Retorna vendas do período anterior (mesma duração) */
export function usePrevPeriodAllSales(funnelId?: string | null) {
  const { dateRange, compareEnabled } = useFilterStore();
  const duration = dateRange.end.getTime() - dateRange.start.getTime();
  const prevEnd = new Date(dateRange.start.getTime() - 1);
  const prevStart = new Date(prevEnd.getTime() - duration);
  const dateFrom = toLocalDate(prevStart);
  const dateTo = toLocalDate(prevEnd);

  return useQuery({
    queryKey: ['all-sales-prev', dateFrom, dateTo, funnelId ?? 'all'],
    queryFn: async () => {
      let query = (supabase as any)
        .from('v_all_sales')
        .select('*')
        .gte('purchased_at', `${dateFrom}T00:00:00`)
        .lte('purchased_at', `${dateTo}T23:59:59`)
        .order('purchased_at', { ascending: false });
      if (funnelId) query = query.eq('funnel_id', funnelId);
      const { data, error } = await query;
      if (error) throw error;
      return (data || []) as UnifiedSale[];
    },
    enabled: compareEnabled,
    ...SHARED_QUERY_OPTIONS,
  });
}
