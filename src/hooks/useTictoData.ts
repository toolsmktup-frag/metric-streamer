import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { classifyTransaction } from '@/lib/classifyTransaction';
import { useFilterStore } from '@/stores/filterStore';

function toLocalDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Returns the local timezone offset as ±HH:MM string (e.g. "-03:00") */
function getTimezoneOffset(): string {
  const offset = new Date().getTimezoneOffset(); // in minutes, positive = behind UTC
  const sign = offset <= 0 ? '+' : '-';
  const abs = Math.abs(offset);
  const hh = String(Math.floor(abs / 60)).padStart(2, '0');
  const mm = String(abs % 60).padStart(2, '0');
  return `${sign}${hh}:${mm}`;
}

const SHARED_QUERY_OPTIONS = {
  staleTime: 30 * 1000,
  gcTime: 5 * 60 * 1000,
  refetchOnWindowFocus: true,
  refetchOnMount: true,
} as const;

export interface SalesAggregation {
  sales_count: number;
  revenue: number; // in reais (converted from centavos)
  front_sales: number;
  front_revenue: number;
  bump_sales: number;
  bump_revenue: number;
  upsell_sales: number;
  upsell_revenue: number;
  downsell_sales: number;
  downsell_revenue: number;
}

// classifyTransaction is imported from @/lib/classifyTransaction
export { classifyTransaction };

function emptySalesAgg(): SalesAggregation {
  return { sales_count: 0, revenue: 0, front_sales: 0, front_revenue: 0, bump_sales: 0, bump_revenue: 0, upsell_sales: 0, upsell_revenue: 0, downsell_sales: 0, downsell_revenue: 0 };
}

export interface TictoTransaction {
  id: string;
  order_id: number;
  order_hash: string;
  transaction_hash: string;
  status: string;
  status_date: string;
  payment_method: string;
  paid_amount: number;
  order_date: string;
  product_name: string;
  product_id: number;
  offer_name: string;
  customer_name: string;
  customer_email: string;
  customer_phone: string;
  utm_source: string | null;
  utm_campaign: string | null;
  utm_medium: string | null;
  utm_content: string | null;
  meta_campaign_id: string | null;
  meta_campaign_name: string | null;
  meta_adset_id: string | null;
  meta_adset_name: string | null;
  meta_ad_id: string | null;
  meta_ad_name: string | null;
  is_paid_traffic: boolean;
}

/**
 * Fetch all Ticto transactions for the selected date range.
 * Only "authorized" status counts as a confirmed sale for revenue.
 * Pass funnelId to filter by a specific funnel.
 */
export function useTictoTransactions(funnelId?: string | null) {
  const { dateRange } = useFilterStore();
  const dateFrom = toLocalDate(dateRange.start);
  const dateTo = toLocalDate(dateRange.end);

  return useQuery({
    queryKey: ['ticto-transactions', dateFrom, dateTo, funnelId ?? 'all'],
    queryFn: async () => {
      // order_date is stored as local time (BRT) labeled as UTC by the webhook,
      // so we query without timezone offset to match correctly.
      let query = (supabase as any)
        .from('ticto_transactions')
        .select('*')
        .gte('order_date', `${dateFrom}T00:00:00`)
        .lte('order_date', `${dateTo}T23:59:59`)
        .order('order_date', { ascending: false });

      if (funnelId) {
        query = query.eq('funnel_id', funnelId);
      }

      const { data, error } = await query;
      if (error) throw error;
      return (data || []) as TictoTransaction[];
    },
    ...SHARED_QUERY_OPTIONS,
  });
}

/**
 * Aggregate sales by campaign_id, adset_id, and ad_id.
 * Returns maps for quick lookup.
 * Pass funnelId to filter by a specific funnel.
 */
export function useSalesAggregation(funnelId?: string | null) {
  const { data: transactions = [] } = useTictoTransactions(funnelId);

  // Only count "authorized" as confirmed revenue
  const confirmed = transactions.filter(t => t.status === 'authorized');

  const byCampaign: Record<string, SalesAggregation> = {};
  const byAdset: Record<string, SalesAggregation> = {};
  const byAd: Record<string, SalesAggregation> = {};

  function addToAgg(agg: SalesAggregation, revenue: number, type: string) {
    agg.sales_count++;
    agg.revenue += revenue;
    if (type === 'principal') { agg.front_sales++; agg.front_revenue += revenue; }
    else if (type === 'bump1') { agg.bump_sales++; agg.bump_revenue += revenue; }
    else if (type === 'upsell1') { agg.upsell_sales++; agg.upsell_revenue += revenue; }
  }

  for (const tx of confirmed) {
    const revenue = tx.paid_amount / 100;
    const type = classifyTransaction(tx);

    if (tx.meta_campaign_id) {
      if (!byCampaign[tx.meta_campaign_id]) byCampaign[tx.meta_campaign_id] = emptySalesAgg();
      addToAgg(byCampaign[tx.meta_campaign_id], revenue, type);
    }

    if (tx.meta_adset_id) {
      if (!byAdset[tx.meta_adset_id]) byAdset[tx.meta_adset_id] = emptySalesAgg();
      addToAgg(byAdset[tx.meta_adset_id], revenue, type);
    }

    if (tx.meta_ad_id) {
      if (!byAd[tx.meta_ad_id]) byAd[tx.meta_ad_id] = emptySalesAgg();
      addToAgg(byAd[tx.meta_ad_id], revenue, type);
    }
  }

  // Organic / unattributed sales
  const organicTransactions = confirmed.filter(t => !t.is_paid_traffic);
  const organicSales = emptySalesAgg();
  for (const tx of organicTransactions) {
    addToAgg(organicSales, tx.paid_amount / 100, classifyTransaction(tx));
  }

  // Total
  const totalSales = emptySalesAgg();
  for (const tx of confirmed) {
    addToAgg(totalSales, tx.paid_amount / 100, classifyTransaction(tx));
  }

  return { byCampaign, byAdset, byAd, organicSales, totalSales, organicTransactions };
}
