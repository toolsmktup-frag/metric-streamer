import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useFilterStore } from '@/stores/filterStore';
import type { Campaign, Adset, Ad, KPISummary, DailyMetric } from '@/hooks/useMockData';
import { useEffect, useCallback, useRef } from 'react';

// ─── Shared query options for performance ───
const SHARED_QUERY_OPTIONS = {
  staleTime: 30 * 1000,           // 30s — keep in sync with useTictoData
  gcTime: 5 * 60 * 1000,          // 5 min cache
  refetchOnWindowFocus: true,
  refetchOnMount: true,
} as const;

/**
 * Converts a Date to YYYY-MM-DD using LOCAL timezone.
 * Using toISOString() would shift the date to UTC and cause off-by-one bugs
 * for users in negative UTC offsets (e.g. Brazil UTC-3 makes "Ontem 23:59 local"
 * become "Hoje 02:59 UTC", so the date string jumps to today).
 */
function toLocalDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

// Helper to extract action values from Meta actions array
// Meta reports actions under multiple prefixes (e.g. omni_, onsite_web_, offsite_conversion.fb_pixel_)
function getActionValue(actions: any[] | null, actionType: string): number {
  if (!actions || !Array.isArray(actions)) return 0;
  // Try exact match first, then common Meta prefixes
  const prefixes = [
    actionType,
    `offsite_conversion.fb_pixel_${actionType}`,
    `omni_${actionType}`,
    `onsite_web_${actionType}`,
    `onsite_web_app_${actionType}`,
  ];
  for (const prefix of prefixes) {
    const action = actions.find((a: any) => a.action_type === prefix);
    if (action) return Number(action.value);
  }
  return 0;
}

function getCostPerAction(costPerActions: any[] | null, actionType: string): number {
  if (!costPerActions || !Array.isArray(costPerActions)) return 0;
  const action = costPerActions.find((a: any) =>
    a.action_type === actionType ||
    a.action_type === `offsite_conversion.fb_pixel_${actionType}`
  );
  return action ? Number(action.value) : 0;
}

interface InsightRow {
  object_id: string;
  object_type: string;
  date_start: string;
  date_stop: string;
  spend: number;
  impressions: number;
  reach: number;
  clicks: number;
  link_clicks: number;
  cpc: number;
  cpm: number;
  ctr: number;
  actions: any;
  cost_per_action_type: any;
}

function aggregateInsights(rows: InsightRow[]) {
  const spend = rows.reduce((s, r) => s + Number(r.spend), 0);
  const impressions = rows.reduce((s, r) => s + Number(r.impressions), 0);
  const reach = rows.reduce((s, r) => s + Number(r.reach), 0);
  const clicks = rows.reduce((s, r) => s + Number(r.clicks), 0);
  const link_clicks = rows.reduce((s, r) => s + Number(r.link_clicks), 0);
  const sales = 0; // Sales come from Ticto webhook, not Meta pixel
  const leads = rows.reduce((s, r) => s + getActionValue(r.actions, 'lead'), 0);
  const initiate_checkout = rows.reduce((s, r) => s + getActionValue(r.actions, 'initiate_checkout'), 0);
  const landing_page_views = rows.reduce((s, r) => s + getActionValue(r.actions, 'landing_page_view'), 0);
  const video_views = rows.reduce((s, r) => s + getActionValue(r.actions, 'video_view'), 0);

  return {
    spend,
    impressions,
    reach,
    clicks,
    link_clicks,
    ctr: impressions > 0 ? (clicks / impressions) * 100 : 0,
    cpc: clicks > 0 ? spend / clicks : 0,
    cpm: impressions > 0 ? (spend / impressions) * 1000 : 0,
    sales,
    leads,
    initiate_checkout,
    landing_page_views,
    video_views,
    revenue: 0, // Revenue comes from Ticto webhook
  };
}

// ─── Helpers para isolamento por funil ──────────────────────────────
/** Retorna IDs das campanhas de um funil para filtrar insights */
async function fetchCampaignIdsForFunnel(funnelId: string): Promise<string[]> {
  const rows = await fetchCampaignRowsForFunnel(funnelId);
  return rows.map((c: any) => c.id);
}

function keywordMatches(name: string, keywords: string[]): boolean {
  const normalizedName = name.toLowerCase();
  return keywords.some((keyword) => normalizedName.includes(keyword.toLowerCase()));
}

async function fetchCampaignRowsForFunnel(funnelId: string): Promise<any[]> {
  const direct: any[] = [];
  let from = 0;
  const pageSize = 1000;
  while (true) {
    const { data } = await (supabase as any)
      .from('meta_campaigns')
      .select('*')
      .eq('funnel_id', funnelId)
      .order('name')
      .range(from, from + pageSize - 1);
    if (!data || data.length === 0) break;
    direct.push(...data);
    if (data.length < pageSize) break;
    from += pageSize;
  }

  const { data: funnel } = await (supabase as any)
    .from('funnels')
    .select('name, meta_account_id, funnel_products(product_name_contains, display_name)')
    .eq('id', funnelId)
    .maybeSingle();

  const accountIds = String(funnel?.meta_account_id || '')
    .split(',')
    .map((id) => id.trim().replace(/^act_/, ''))
    .filter(Boolean);
  if (accountIds.length === 0) return direct;

  const baseName = String(funnel?.name || '').replace(/\s*-\s*\d+\s*$/, '').trim();
  const keywords = [
    baseName,
    ...(funnel?.funnel_products || []).flatMap((p: any) => [p.product_name_contains, p.display_name]),
  ].filter((v: string | null | undefined) => String(v || '').trim().length >= 3) as string[];
  if (keywords.length === 0) return direct;

  const fallback: any[] = [];
  from = 0;
  while (true) {
    let query = (supabase as any)
      .from('meta_campaigns')
      .select('*')
      .order('name')
      .range(from, from + pageSize - 1);
    query = accountIds.length === 1 ? query.eq('account_id', accountIds[0]) : query.in('account_id', accountIds);
    const { data } = await query;
    if (!data || data.length === 0) break;
    fallback.push(...data.filter((c: any) => keywordMatches(c.name || '', keywords)));
    if (data.length < pageSize) break;
    from += pageSize;
  }
  const byId = new Map<string, any>();
  for (const row of [...direct, ...fallback]) byId.set(row.id, row);
  return Array.from(byId.values()).sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')));
}

async function fetchRowsByFieldValues(table: string, field: string, values: string[], orderBy = 'name'): Promise<any[]> {
  if (values.length === 0) return [];
  const byId = new Map<string, any>();
  for (let i = 0; i < values.length; i += MAX_IDS_PER_QUERY) {
    const chunk = values.slice(i, i + MAX_IDS_PER_QUERY);
    let from = 0;
    const pageSize = 1000;
    while (true) {
      const { data } = await (supabase as any)
        .from(table)
        .select('*')
        .in(field, chunk)
        .order(orderBy)
        .range(from, from + pageSize - 1);
      if (!data || data.length === 0) break;
      for (const row of data) byId.set(row.id, row);
      if (data.length < pageSize) break;
      from += pageSize;
    }
  }
  return Array.from(byId.values()).sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')));
}

async function fetchAccountIdsForFunnel(funnelId: string): Promise<string[]> {
  const { data } = await (supabase as any)
    .from('funnels')
    .select('meta_account_id')
    .eq('id', funnelId)
    .maybeSingle();

  return String(data?.meta_account_id || '')
    .split(',')
    .map((id) => id.trim().replace(/^act_/, ''))
    .filter(Boolean);
}

async function fetchAdsetIdsForFunnel(funnelId: string): Promise<string[]> {
  const campaignIds = await fetchCampaignIdsForFunnel(funnelId);
  const rows = await fetchRowsByFieldValues('meta_adsets', 'campaign_id', campaignIds);
  return rows.map((a: any) => a.id);
}

async function fetchAdIdsForFunnel(funnelId: string): Promise<string[]> {
  const campaignIds = await fetchCampaignIdsForFunnel(funnelId);
  const rows = await fetchRowsByFieldValues('meta_ads', 'campaign_id', campaignIds);
  return rows.map((a: any) => a.id);
}

// ─── Shared insight fetcher with pagination (avoids 1000-row limit) ───
// objectIds?: quando passado, filtra por esses IDs (two-step fetch para isolamento por funil).
// Se objectIds = [] (funil sem campanhas), retorna imediatamente sem fazer query desnecessária.
// IDs são divididos em chunks para evitar erro 400 por URL muito longa no PostgREST.
const MAX_IDS_PER_QUERY = 150;

async function fetchInsightsByType(
  objectType: string,
  dateFrom: string,
  dateTo: string,
  objectIds?: string[],
): Promise<InsightRow[]> {
  // Funil existe mas não tem campanhas/adsets/ads → retorna vazio diretamente
  if (objectIds !== undefined && objectIds.length === 0) return [];

  // Se temos muitos IDs, dividir em chunks para evitar URL overflow (PostgREST 400)
  if (objectIds && objectIds.length > MAX_IDS_PER_QUERY) {
    const results: InsightRow[] = [];
    for (let i = 0; i < objectIds.length; i += MAX_IDS_PER_QUERY) {
      const chunk = objectIds.slice(i, i + MAX_IDS_PER_QUERY);
      const chunkResults = await fetchInsightsByType(objectType, dateFrom, dateTo, chunk);
      results.push(...chunkResults);
    }
    return results;
  }

  const all: InsightRow[] = [];
  let from = 0;
  const pageSize = 1000;
  while (true) {
    let query = supabase
      .from('meta_insights')
      .select('*')
      .eq('object_type', objectType)
      .gte('date_start', dateFrom)
      .lte('date_start', dateTo);

    if (objectIds && objectIds.length > 0) {
      query = query.in('object_id', objectIds);
    }

    const { data } = await query.range(from, from + pageSize - 1);
    if (!data || data.length === 0) break;
    all.push(...(data as InsightRow[]));
    if (data.length < pageSize) break;
    from += pageSize;
  }
  return all;
}

async function fetchAccountInsightsForFunnel(funnelId: string, dateFrom: string, dateTo: string): Promise<InsightRow[]> {
  const accountIds = await fetchAccountIdsForFunnel(funnelId);
  if (accountIds.length === 0) return [];
  return fetchInsightsByType('account', dateFrom, dateTo, accountIds);
}

function groupInsightsById(insights: InsightRow[]): Record<string, InsightRow[]> {
  const map: Record<string, InsightRow[]> = {};
  for (const ins of insights) {
    if (!map[ins.object_id]) map[ins.object_id] = [];
    map[ins.object_id].push(ins);
  }
  return map;
}

/** Paginated fetch to bypass Supabase's 1000-row default limit */
async function fetchAllRows(table: string, orderBy = 'name') {
  const all: any[] = [];
  let from = 0;
  const pageSize = 1000;
  while (true) {
    const { data } = await (supabase as any)
      .from(table)
      .select('*')
      .order(orderBy)
      .range(from, from + pageSize - 1);
    if (!data || data.length === 0) break;
    all.push(...data);
    if (data.length < pageSize) break;
    from += pageSize;
  }
  return all;
}


export function useMetaCampaigns(funnelId?: string | null) {
  const { dateRange, lastUpdated } = useFilterStore();
  const dateFrom = toLocalDate(dateRange.start);
  const dateTo = toLocalDate(dateRange.end);

  return useQuery({
    queryKey: ['meta-campaigns', dateFrom, dateTo, funnelId ?? 'all', lastUpdated.getTime()],
    queryFn: async () => {
      // Buscar campanhas com filtro de funil quando aplicável
      const all: any[] = [];
      const pageSize = 1000;
      let from = 0;
      if (funnelId) {
        all.push(...await fetchCampaignRowsForFunnel(funnelId));
      } else {
      while (true) {
        const q = (supabase as any).from('meta_campaigns').select('*').order('name');
        const { data } = await q.range(from, from + pageSize - 1);
        if (!data || data.length === 0) break;
        all.push(...data);
        if (data.length < pageSize) break;
        from += pageSize;
      }
      }
      if (!all.length) return [];

      const campaignIds = all.map((c: any) => c.id);
      const insights = await fetchInsightsByType('campaign', dateFrom, dateTo, funnelId ? campaignIds : undefined);
      const insightsByObj = groupInsightsById(insights);

      return all.map((c: any) => {
        const agg = aggregateInsights(insightsByObj[c.id] || []);
        const status = c.status === 'ACTIVE' ? 'active' : c.status === 'PAUSED' ? 'paused' : 'error';
        return {
          id: c.id,
          name: c.name,
          status,
          ...agg,
          profit: agg.revenue - agg.spend,
          roas: agg.spend > 0 ? agg.revenue / agg.spend : 0,
          cpa: agg.sales > 0 ? agg.spend / agg.sales : 0,
        } as Campaign;
      });
    },
    ...SHARED_QUERY_OPTIONS,
  });
}

export function useMetaAdsets(funnelId?: string | null) {
  const { dateRange, lastUpdated } = useFilterStore();
  const dateFrom = toLocalDate(dateRange.start);
  const dateTo = toLocalDate(dateRange.end);

  return useQuery({
    queryKey: ['meta-adsets', dateFrom, dateTo, funnelId ?? 'all', lastUpdated.getTime()],
    queryFn: async () => {
      const all: any[] = [];
      let from = 0;
      const pageSize = 1000;
      if (funnelId) {
        const campaignIds = await fetchCampaignIdsForFunnel(funnelId);
        all.push(...await fetchRowsByFieldValues('meta_adsets', 'campaign_id', campaignIds));
      } else {
        while (true) {
          const { data } = await (supabase as any).from('meta_adsets').select('*').order('name').range(from, from + pageSize - 1);
          if (!data || data.length === 0) break;
          all.push(...data);
          if (data.length < pageSize) break;
          from += pageSize;
        }
      }
      if (!all.length) return [];

      const adsetIds = all.map((a: any) => a.id);
      const insights = await fetchInsightsByType('adset', dateFrom, dateTo, funnelId ? adsetIds : undefined);
      const insightsByObj = groupInsightsById(insights);

      return all.map((a: any) => {
        const agg = aggregateInsights(insightsByObj[a.id] || []);
        const status = a.status === 'ACTIVE' ? 'active' : a.status === 'PAUSED' ? 'paused' : 'error';
        return {
          id: a.id,
          campaign_id: a.campaign_id,
          name: a.name,
          status,
          ...agg,
          profit: agg.revenue - agg.spend,
          roas: agg.spend > 0 ? agg.revenue / agg.spend : 0,
          cpa: agg.sales > 0 ? agg.spend / agg.sales : 0,
          ads: [],
        } as Adset;
      });
    },
    ...SHARED_QUERY_OPTIONS,
  });
}

export function useMetaAds(funnelId?: string | null) {
  const { dateRange, lastUpdated } = useFilterStore();
  const dateFrom = toLocalDate(dateRange.start);
  const dateTo = toLocalDate(dateRange.end);

  return useQuery({
    queryKey: ['meta-ads', dateFrom, dateTo, funnelId ?? 'all', lastUpdated.getTime()],
    queryFn: async () => {
      const all: any[] = [];
      let from = 0;
      const pageSize = 1000;
      if (funnelId) {
        const campaignIds = await fetchCampaignIdsForFunnel(funnelId);
        all.push(...await fetchRowsByFieldValues('meta_ads', 'campaign_id', campaignIds));
      } else {
        while (true) {
          const { data } = await (supabase as any).from('meta_ads').select('*').order('name').range(from, from + pageSize - 1);
          if (!data || data.length === 0) break;
          all.push(...data);
          if (data.length < pageSize) break;
          from += pageSize;
        }
      }
      if (!all.length) return [];

      const adIds = all.map((a: any) => a.id);
      const insights = await fetchInsightsByType('ad', dateFrom, dateTo, funnelId ? adIds : undefined);
      const insightsByObj = groupInsightsById(insights);

      return all.map((a: any) => {
        const agg = aggregateInsights(insightsByObj[a.id] || []);
        const status = a.status === 'ACTIVE' ? 'active' : a.status === 'PAUSED' ? 'paused' : 'error';
        return {
          id: a.id,
          adset_id: a.adset_id,
          campaign_id: a.campaign_id,
          name: a.name,
          status,
          ...agg,
          profit: agg.revenue - agg.spend,
          roas: agg.spend > 0 ? agg.revenue / agg.spend : 0,
          cpa: agg.sales > 0 ? agg.spend / agg.sales : 0,
          creative: a.creative || null,
        } as Ad;
      });
    },
    ...SHARED_QUERY_OPTIONS,
  });
}

export function useMetaDailyInsights(funnelId?: string | null) {
  const { dateRange, lastUpdated } = useFilterStore();
  const dateFrom = toLocalDate(dateRange.start);
  const dateTo = toLocalDate(dateRange.end);

  return useQuery({
    queryKey: ['meta-daily-insights', dateFrom, dateTo, funnelId ?? 'all', lastUpdated.getTime()],
    queryFn: async () => {
      const campaignIds = funnelId ? await fetchCampaignIdsForFunnel(funnelId) : undefined;
      const campaignInsights = await fetchInsightsByType('campaign', dateFrom, dateTo, campaignIds);
      const campaignSpend = campaignInsights.reduce((s, r) => s + Number(r.spend || 0), 0);
      const accountFallbackInsights = funnelId && campaignSpend === 0
        ? await fetchAccountInsightsForFunnel(funnelId, dateFrom, dateTo)
        : [];
      const insights = campaignSpend > 0 || accountFallbackInsights.length === 0 ? campaignInsights : accountFallbackInsights;

      const byDate: Record<string, InsightRow[]> = {};
      for (const row of insights) {
        if (!byDate[row.date_start]) byDate[row.date_start] = [];
        byDate[row.date_start].push(row);
      }

      return Object.entries(byDate)
        .map(([date, rows]) => {
          const agg = aggregateInsights(rows);
          return {
            date,
            revenue: agg.revenue,
            spend: agg.spend,
            sales: agg.sales,
            impressions: agg.impressions,
            clicks: agg.clicks,
            link_clicks: agg.link_clicks,
          } as DailyMetric;
        })
        .sort((a, b) => a.date.localeCompare(b.date));
    },
    ...SHARED_QUERY_OPTIONS,
  });
}

export function useMetaKPISummary(funnelId?: string | null) {
  const { dateRange, lastUpdated } = useFilterStore();
  const dateFrom = toLocalDate(dateRange.start);
  const dateTo = toLocalDate(dateRange.end);

  return useQuery({
    queryKey: ['meta-kpi', dateFrom, dateTo, funnelId ?? 'all', lastUpdated.getTime()],
    queryFn: async () => {
      const campaignIds = funnelId ? await fetchCampaignIdsForFunnel(funnelId) : undefined;
      const campaignInsights = await fetchInsightsByType('campaign', dateFrom, dateTo, campaignIds);
      const campaignAgg = aggregateInsights(campaignInsights);
      const accountFallbackInsights = funnelId && campaignAgg.spend === 0
        ? await fetchAccountInsightsForFunnel(funnelId, dateFrom, dateTo)
        : [];
      const insights = campaignAgg.spend > 0 || accountFallbackInsights.length === 0 ? campaignInsights : accountFallbackInsights;
      const agg = aggregateInsights(insights);
      const totalRevenue = agg.revenue;
      const totalSpend = agg.spend;

      return {
        revenue: totalRevenue,
        revenueVar: 0,
        spend: totalSpend,
        spendVar: 0,
        roas: totalSpend > 0 ? totalRevenue / totalSpend : 0,
        roasVar: 0,
        profit: totalRevenue - totalSpend,
        profitVar: 0,
        sales: agg.sales,
        salesVar: 0,
        cpa: agg.sales > 0 ? totalSpend / agg.sales : 0,
        cpaVar: 0,
        ctr: agg.ctr,
        ctrVar: 0,
        impressions: agg.impressions,
        impressionsVar: 0,
      } as KPISummary;
    },
    ...SHARED_QUERY_OPTIONS,
  });
}

/** Retorna o período anterior de mesma duração */
export function getPrevPeriod(dateRange: { start: Date; end: Date }): { start: Date; end: Date } {
  const duration = dateRange.end.getTime() - dateRange.start.getTime();
  const prevEnd = new Date(dateRange.start.getTime() - 1); // 1ms antes do início atual
  const prevStart = new Date(prevEnd.getTime() - duration);
  return { start: prevStart, end: prevEnd };
}

export function usePrevPeriodMetaInsights(funnelId?: string | null) {
  const { dateRange, compareEnabled, lastUpdated } = useFilterStore();
  const prev = getPrevPeriod(dateRange);
  const dateFrom = toLocalDate(prev.start);
  const dateTo = toLocalDate(prev.end);

  return useQuery({
    queryKey: ['meta-kpi-prev', dateFrom, dateTo, funnelId ?? 'all', lastUpdated.getTime()],
    queryFn: async () => {
      const campaignIds = funnelId ? await fetchCampaignIdsForFunnel(funnelId) : undefined;
      const insights = await fetchInsightsByType('campaign', dateFrom, dateTo, campaignIds);
      return aggregateInsights(insights);
    },
    enabled: compareEnabled,
    ...SHARED_QUERY_OPTIONS,
  });
}

export function useMetaDemographics() {
  const { dateRange } = useFilterStore();
  const dateFrom = toLocalDate(dateRange.start);
  const dateTo = toLocalDate(dateRange.end);

  return useQuery({
    queryKey: ['meta-demographics', dateFrom, dateTo],
    queryFn: async () => {
      const { data } = await supabase
        .from('meta_demographic_insights')
        .select('*')
        .gte('date_start', dateFrom)
        .lte('date_start', dateTo);

      const byAge: Record<string, { spend: number; sales: number; impressions: number }> = {};
      const byGender: Record<string, { spend: number; sales: number; impressions: number }> = {};

      for (const row of (data || [])) {
        const age = row.age || 'unknown';
        const gender = row.gender || 'unknown';
        const spend = Number(row.spend);
        const sales = getActionValue(row.actions as any, 'purchase');
        const impressions = Number(row.impressions);

        if (!byAge[age]) byAge[age] = { spend: 0, sales: 0, impressions: 0 };
        byAge[age].spend += spend;
        byAge[age].sales += sales;
        byAge[age].impressions += impressions;

        if (!byGender[gender]) byGender[gender] = { spend: 0, sales: 0, impressions: 0 };
        byGender[gender].spend += spend;
        byGender[gender].sales += sales;
        byGender[gender].impressions += impressions;
      }

      const ageData = Object.entries(byAge).map(([age, v]) => ({
        age,
        spend: v.spend,
        sales: v.sales,
      }));

      const genderMap: Record<string, string> = {
        female: 'Feminino',
        male: 'Masculino',
        unknown: 'Outros',
      };
      const genderColors: Record<string, string> = {
        female: 'hsl(330, 60%, 50%)',
        male: 'hsl(210, 80%, 55%)',
        unknown: 'hsl(38, 92%, 50%)',
      };

      const genderData = Object.entries(byGender).map(([gender, v]) => ({
        name: genderMap[gender] || gender,
        value: v.spend,
        color: genderColors[gender] || 'hsl(38, 92%, 50%)',
      }));

      return { ageData, genderData };
    },
    ...SHARED_QUERY_OPTIONS,
  });
}

export function useMetaGeo() {
  const { dateRange } = useFilterStore();
  const dateFrom = toLocalDate(dateRange.start);
  const dateTo = toLocalDate(dateRange.end);

  return useQuery({
    queryKey: ['meta-geo', dateFrom, dateTo],
    queryFn: async () => {
      const { data } = await supabase
        .from('meta_geo_insights')
        .select('*')
        .gte('date_start', dateFrom)
        .lte('date_start', dateTo);

      const byCountry: Record<string, { spend: number; sales: number; impressions: number }> = {};

      for (const row of (data || [])) {
        const country = row.country || 'Outros';
        if (!byCountry[country]) byCountry[country] = { spend: 0, sales: 0, impressions: 0 };
        byCountry[country].spend += Number(row.spend);
        byCountry[country].sales += getActionValue(row.actions as any, 'purchase');
        byCountry[country].impressions += Number(row.impressions);
      }

      return Object.entries(byCountry)
        .map(([country, v]) => ({ country, ...v }))
        .sort((a, b) => b.spend - a.spend);
    },
    ...SHARED_QUERY_OPTIONS,
  });
}

export function useMetaDevices() {
  const { dateRange } = useFilterStore();
  const dateFrom = toLocalDate(dateRange.start);
  const dateTo = toLocalDate(dateRange.end);

  return useQuery({
    queryKey: ['meta-devices', dateFrom, dateTo],
    queryFn: async () => {
      const { data } = await supabase
        .from('meta_device_insights')
        .select('*')
        .gte('date_start', dateFrom)
        .lte('date_start', dateTo);

      const byPlatform: Record<string, { spend: number; sales: number; impressions: number }> = {};
      const byPosition: Record<string, { spend: number; sales: number; impressions: number }> = {};
      const byDevice: Record<string, { spend: number; sales: number; impressions: number }> = {};

      for (const row of (data || [])) {
        const platform = row.publisher_platform || 'Outros';
        const position = row.platform_position || 'Outros';
        const device = row.impression_device || 'Outros';
        const spend = Number(row.spend);
        const sales = getActionValue(row.actions as any, 'purchase');
        const impressions = Number(row.impressions);

        if (!byPlatform[platform]) byPlatform[platform] = { spend: 0, sales: 0, impressions: 0 };
        byPlatform[platform].spend += spend;
        byPlatform[platform].sales += sales;
        byPlatform[platform].impressions += impressions;

        if (!byPosition[position]) byPosition[position] = { spend: 0, sales: 0, impressions: 0 };
        byPosition[position].spend += spend;
        byPosition[position].sales += sales;
        byPosition[position].impressions += impressions;

        if (!byDevice[device]) byDevice[device] = { spend: 0, sales: 0, impressions: 0 };
        byDevice[device].spend += spend;
        byDevice[device].sales += sales;
        byDevice[device].impressions += impressions;
      }

      const toArray = (map: Record<string, any>) =>
        Object.entries(map)
          .map(([name, v]) => ({ name, ...v }))
          .sort((a: any, b: any) => b.spend - a.spend);

      return {
        platformData: toArray(byPlatform),
        positionData: toArray(byPosition),
        deviceData: toArray(byDevice),
      };
    },
    ...SHARED_QUERY_OPTIONS,
  });
}

// ─── Sync mutation: fire-and-forget, non-blocking ───
export function useSyncMeta() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params?: { date_from?: string; date_to?: string; full_sync?: boolean }) => {
      const { data, error } = await supabase.functions.invoke('sync-meta', {
        body: params || {},
      });
      if (error) throw new Error(error.message || 'Erro ao sincronizar Meta');
      return data;
    },
    onSettled: () => {
      const keys = [
        'meta-campaigns', 'meta-adsets', 'meta-ads',
        'meta-daily-insights', 'meta-kpi',
        'meta-demographics', 'meta-geo', 'meta-devices',
        'all-sales', 'all-sales-prev',
      ];
      keys.forEach(k => queryClient.invalidateQueries({ queryKey: [k] }));
    },
  });
}

// ─── Smart polling: only polls while sync is running, 3s interval ───
export function useMetaSyncStatus() {
  return useQuery({
    queryKey: ['meta-sync-status'],
    queryFn: async () => {
      const { data } = await supabase
        .from('meta_sync_log')
        .select('*')
        .order('started_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      return data;
    },
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      // Poll every 3s only while running, otherwise stop polling
      return status === 'running' ? 3000 : false;
    },
    ...SHARED_QUERY_OPTIONS,
    staleTime: 0, // sync status should always be fresh
    refetchOnMount: true,
  });
}

// ─── Hook to auto-refetch data when sync completes ───
export function useSyncPollingRefetch() {
  const queryClient = useQueryClient();
  const { data: syncStatus } = useMetaSyncStatus();
  const prevStatusRef = useRef<string | null>(null);

  useEffect(() => {
    const currentStatus = syncStatus?.status || null;
    const prevStatus = prevStatusRef.current;

    // When status transitions from 'running' to 'completed', refetch all data
    if (prevStatus === 'running' && currentStatus === 'completed') {
      const keys = [
        'meta-campaigns', 'meta-adsets', 'meta-ads',
        'meta-daily-insights', 'meta-kpi',
        'meta-demographics', 'meta-geo', 'meta-devices',
        'all-sales', 'all-sales-prev',
      ];
      keys.forEach(k => queryClient.invalidateQueries({ queryKey: [k] }));
    }

    prevStatusRef.current = currentStatus;
  }, [syncStatus?.status, queryClient]);

  return syncStatus;
}
