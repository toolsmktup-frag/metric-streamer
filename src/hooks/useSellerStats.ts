import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { startOfMonth, endOfDay, startOfDay, subDays, format, differenceInDays } from 'date-fns';

const COMMISSION_RATE = 0.10;

function toAmount(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function getCommissionAmount(sale: { revenue?: unknown; affiliate_commission?: unknown }): number {
  const affiliateCommission = toAmount(sale.affiliate_commission);
  if (affiliateCommission > 0) {
    return affiliateCommission;
  }

  return toAmount(sale.revenue) * COMMISSION_RATE;
}

export interface SellerStats {
  monthSales: number;
  monthRevenue: number;
  monthCommission: number;
  todaySales: number;
  todayRevenue: number;
  yesterdayRevenue: number;
  todayLeads: number;
  avgDailyLeads: number;
  monthConversion: number;
  prevMonthConversion: number;
  streak: number;
  salesByDay: { date: string; revenue: number; count: number }[];
  // Period-filtered stats
  periodSales: number;
  periodRevenue: number;
  periodCommission: number;
}

export interface SellerStatsDateRange {
  start: Date;
  end: Date;
}

async function fetchSellerStats(sellerName: string, periodRange?: SellerStatsDateRange): Promise<SellerStats> {
  const now = new Date();
  const monthStart = startOfMonth(now);
  const today = startOfDay(now);
  const yesterday = startOfDay(subDays(now, 1));

  // Fetch month sales for this seller
  const { data: monthData } = await (supabase as any)
    .from('v_all_sales')
    .select('purchased_at, revenue, affiliate_commission, status')
    .ilike('affiliate_name', `%${sellerName}%`)
    .gte('purchased_at', monthStart.toISOString())
    .lte('purchased_at', endOfDay(now).toISOString());

  const sales = (monthData || []) as any[];
  const approved = sales.filter((s: any) => s.status === 'authorized');

  const monthSales = approved.length;
  const monthRevenue = approved.reduce((sum: number, s: any) => sum + toAmount(s.revenue), 0);
  const monthCommission = approved.reduce((sum: number, s: any) => sum + getCommissionAmount(s), 0);

  // Today
  const todayStr = format(today, 'yyyy-MM-dd');
  const yesterdayStr = format(yesterday, 'yyyy-MM-dd');

  const todaySales = approved.filter((s: any) => s.purchased_at?.startsWith(todayStr));
  const yesterdaySales = approved.filter((s: any) => s.purchased_at?.startsWith(yesterdayStr));

  // Sales by day for streak
  const dayMap = new Map<string, { revenue: number; count: number }>();
  for (const s of approved) {
    const d = (s.purchased_at || '').slice(0, 10);
    const entry = dayMap.get(d) || { revenue: 0, count: 0 };
    entry.revenue += toAmount(s.revenue);
    entry.count++;
    dayMap.set(d, entry);
  }

  // Streak calculation
  let streak = 0;
  let checkDate = new Date(today);
  if (!dayMap.has(todayStr)) {
    checkDate = new Date(yesterday);
  }
  while (true) {
    const d = format(checkDate, 'yyyy-MM-dd');
    if (dayMap.has(d)) {
      streak++;
      checkDate = subDays(checkDate, 1);
    } else {
      break;
    }
  }

  const salesByDay = Array.from(dayMap.entries())
    .map(([date, v]) => ({ date, ...v }))
    .sort((a, b) => a.date.localeCompare(b.date));

  const daysInMonth = differenceInDays(now, monthStart) + 1;

  // Period-filtered stats (separate query if range differs from month)
  let periodSales = 0;
  let periodRevenue = 0;
  let periodCommission = 0;

  if (periodRange) {
    const pStart = startOfDay(periodRange.start);
    const pEnd = endOfDay(periodRange.end);

    // Check if period is within the month data we already have
    if (pStart >= monthStart && pEnd <= endOfDay(now)) {
      // Filter from existing data
      const pStartStr = format(pStart, 'yyyy-MM-dd');
      const pEndStr = format(pEnd, 'yyyy-MM-dd');
      const periodApproved = approved.filter((s: any) => {
        const d = (s.purchased_at || '').slice(0, 10);
        return d >= pStartStr && d <= pEndStr;
      });
      periodSales = periodApproved.length;
      periodRevenue = periodApproved.reduce((sum: number, s: any) => sum + toAmount(s.revenue), 0);
      periodCommission = periodApproved.reduce((sum: number, s: any) => sum + getCommissionAmount(s), 0);
    } else {
      // Need separate query
      const { data: periodData } = await (supabase as any)
        .from('v_all_sales')
        .select('revenue, affiliate_commission, status')
        .ilike('affiliate_name', `%${sellerName}%`)
        .gte('purchased_at', pStart.toISOString())
        .lte('purchased_at', pEnd.toISOString());

      const pApproved = ((periodData || []) as any[]).filter((s: any) => s.status === 'authorized');
      periodSales = pApproved.length;
      periodRevenue = pApproved.reduce((sum: number, s: any) => sum + toAmount(s.revenue), 0);
      periodCommission = pApproved.reduce((sum: number, s: any) => sum + getCommissionAmount(s), 0);
    }
  }

  return {
    monthSales,
    monthRevenue,
    monthCommission,
    todaySales: todaySales.length,
    todayRevenue: todaySales.reduce((s: number, t: any) => s + toAmount(t.revenue), 0),
    yesterdayRevenue: yesterdaySales.reduce((s: number, t: any) => s + toAmount(t.revenue), 0),
    todayLeads: todaySales.length,
    avgDailyLeads: daysInMonth > 0 ? monthSales / daysInMonth : 0,
    monthConversion: 0,
    prevMonthConversion: 0,
    streak,
    salesByDay,
    periodSales,
    periodRevenue,
    periodCommission,
  };
}

export function useSellerStats(sellerName?: string, periodRange?: SellerStatsDateRange) {
  return useQuery({
    queryKey: ['seller-stats', sellerName, periodRange?.start?.toISOString(), periodRange?.end?.toISOString()],
    queryFn: () => fetchSellerStats(sellerName!, periodRange),
    enabled: !!sellerName,
    staleTime: 30 * 1000,
    refetchOnWindowFocus: true,
  });
}
