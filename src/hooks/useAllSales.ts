import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useFilterStore } from '@/stores/filterStore';
import type { SalesAggregation } from './useTictoData';
import { classifyTransaction as classifySale } from '@/lib/classifyTransaction';
import { toLocalDate, dayStartISO, dayEndISO } from '@/lib/dateUtils';
import type { FunnelProduct } from './useFunnels';

const SHARED_QUERY_OPTIONS = {
  staleTime: 30 * 1000,
  gcTime: 5 * 60 * 1000,
  refetchOnWindowFocus: true,
  refetchOnMount: true,
} as const;

const SALES_PAGE_SIZE = 1000;

/** Linha normalizada da view v_all_sales — revenue em reais, sem centavos */
export interface UnifiedSale {
  id: string;
  platform: string;
  funnel_id: string | null;
  status: string;
  purchased_at: string;
  revenue: number;
  product_name: string | null;
  product_id: string | null;
  offer_name: string | null;
  payment_method: string | null;
  customer_name: string | null;
  customer_email: string | null;
  customer_phone?: string | null;
  unified_customer_id?: string | null;
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
  ingestion_type: string;
  affiliate_name: string | null;
  affiliate_commission: number | null;
  // Classificação DURÁVEL vinda da view v_all_sales_classified (via funnel_products).
  // É a fonte de verdade da posição no funil — o front só lê, não recalcula.
  funnel_position?: string | null;       // principal | bump1 | upsell1 | downsell | other
  mapped_role?: string | null;           // role bruto do funnel_products
  mapped_funnel_id?: string | null;      // funil do produto (via funnel_products)
}

async function fetchAllSalesRows(dateFrom: string, dateTo: string, funnelId?: string | null, ingestionType?: string | null, paidTrafficOnly?: boolean) {
  const rows: UnifiedSale[] = [];

  for (let from = 0; ; from += SALES_PAGE_SIZE) {
    let query = (supabase as any)
      .from('v_all_sales_classified')
      .select('*')
      .gte('purchased_at', dayStartISO(dateFrom))
      .lte('purchased_at', dayEndISO(dateTo))
      .order('purchased_at', { ascending: false })
      .range(from, from + SALES_PAGE_SIZE - 1);

    if (funnelId) {
      query = query.eq('funnel_id', funnelId);
    }

    if (ingestionType) {
      query = query.eq('ingestion_type', ingestionType);
    }

    if (paidTrafficOnly) {
      query = query.eq('is_paid_traffic', true);
    }

    const { data, error } = await query;
    if (error) throw error;

    const batch = (data || []) as UnifiedSale[];
    rows.push(...batch);

    if (batch.length < SALES_PAGE_SIZE) break;
  }

  return rows;
}

/**
 * Busca todas as vendas (Ticto + Guru + Eduzz + ...) via view v_all_sales.
 * Passe funnelId para filtrar por funil específico.
 */
export function useAllSales(funnelId?: string | null, ingestionType?: string | null, paidTrafficOnly?: boolean) {
  const { dateRange, lastUpdated } = useFilterStore();
  const dateFrom = toLocalDate(dateRange.start);
  const dateTo = toLocalDate(dateRange.end);

  return useQuery({
    queryKey: ['all-sales', dateFrom, dateTo, funnelId ?? 'all', ingestionType ?? 'all', paidTrafficOnly ?? false, lastUpdated.getTime()],
    queryFn: async () => fetchAllSalesRows(dateFrom, dateTo, funnelId, ingestionType, paidTrafficOnly),
    ...SHARED_QUERY_OPTIONS,
  });
}

function emptySalesAgg(): SalesAggregation {
  return {
    sales_count: 0, revenue: 0,
    front_sales: 0, front_revenue: 0,
    bump_sales: 0, bump_revenue: 0,
    upsell_sales: 0, upsell_revenue: 0,
    downsell_sales: 0, downsell_revenue: 0,
  };
}


/**
 * Agrega vendas de todas as plataformas por campanha / adset / ad.
 * Substitui useSalesAggregation para o Resumo Geral e páginas de funil.
 */
/**
 * Classifica uma venda usando funnel_products dinâmicos (se disponíveis)
 * ou fallback para classificação hardcoded.
 */
export function classifyWithProducts(
  tx: { platform?: string | null; product_name?: string | null; product_id?: string | number | null; offer_name?: string | null; funnel_position?: string | null },
  funnelProducts?: FunnelProduct[]
): string {
  // Fonte de verdade DURÁVEL: a view v_all_sales_classified já classificou via
  // funnel_products no banco. Se veio preenchida, usa direto (toda tela fica
  // consistente e imune a reescritas do front). Fallback abaixo só p/ dados sem a coluna.
  if (tx.funnel_position) return tx.funnel_position;

  const explicitClassification = classifySale(tx);
  if (tx.product_id != null && explicitClassification !== 'other') {
    return explicitClassification;
  }

  if (funnelProducts && funnelProducts.length > 0) {
    const txProductId = String(tx.product_id || '').trim();
    const name = (tx.product_name || '').toLowerCase();
    const platform = String(tx.platform || '').trim().toLowerCase();

    const productAppliesToPlatform = (fp: FunnelProduct): boolean => {
      if (!fp.platform || !platform) return true;
      return String(fp.platform).trim().toLowerCase() === platform;
    };

    const roleToPosition = (role: string): string => {
      if (role === 'front') return 'principal';
      if (role === 'order_bump') return 'bump1';
      if (role === 'upsell1' || role === 'upsell2' || role === 'upsell3') return 'upsell1';
      if (role === 'downsell') return 'downsell';
      return 'other';
    };

    // Pass 1: exact product_id match (source of truth — must win over name matches)
    if (txProductId) {
      for (const fp of funnelProducts) {
        if (productAppliesToPlatform(fp) && fp.product_id && String(fp.product_id) === txProductId) {
          return roleToPosition(fp.role);
        }
      }
    }

    // Pass 2: product_name_contains fallback
    if (name) {
      for (const fp of funnelProducts) {
        if (productAppliesToPlatform(fp) && fp.product_name_contains && name.includes(fp.product_name_contains.toLowerCase())) {
          return roleToPosition(fp.role);
        }
      }
    }

    return 'other';
  }
  return classifySale(tx);
}

function normalizeEmail(value?: string | null): string | null {
  const normalized = (value || '').trim().toLowerCase();
  return normalized.includes('@') ? normalized : null;
}

function normalizePhone(value?: string | null): string | null {
  const digits = (value || '').replace(/\D/g, '');
  if (digits.length < 10) return null;
  return digits.slice(-10);
}

function saleTime(sale: UnifiedSale): number {
  const time = new Date(sale.purchased_at).getTime();
  return Number.isFinite(time) ? time : 0;
}

function hasMetaAttribution(sale: UnifiedSale): boolean {
  return Boolean(sale.meta_campaign_id || sale.meta_adset_id || sale.meta_ad_id);
}

function getIdentityKeys(sale: UnifiedSale): string[] {
  const keys = new Set<string>();
  if (sale.unified_customer_id) keys.add(`customer:${sale.unified_customer_id}`);

  const email = normalizeEmail(sale.customer_email);
  if (email) keys.add(`email:${email}`);

  const phone = normalizePhone(sale.customer_phone);
  if (phone) keys.add(`phone:${phone}`);

  return Array.from(keys);
}

function resolveInheritedAttribution(sales: UnifiedSale[]): UnifiedSale[] {
  const donorsByIdentity = new Map<string, UnifiedSale[]>();

  for (const sale of sales) {
    if (!hasMetaAttribution(sale)) continue;
    for (const key of getIdentityKeys(sale)) {
      const donors = donorsByIdentity.get(key) || [];
      donors.push(sale);
      donorsByIdentity.set(key, donors);
    }
  }

  for (const donors of donorsByIdentity.values()) {
    donors.sort((a, b) => saleTime(b) - saleTime(a));
  }

  return sales.map((sale) => {
    if (hasMetaAttribution(sale)) return sale;

    const saleTs = saleTime(sale);
    const candidates = getIdentityKeys(sale)
      .flatMap((key) => donorsByIdentity.get(key) || [])
      .filter((donor, index, array) => array.findIndex((item) => item.id === donor.id) === index)
      .filter((donor) => {
        const donorTs = saleTime(donor);
        if (!donorTs || !saleTs) return true;
        const diffDays = (saleTs - donorTs) / (24 * 60 * 60 * 1000);
        return diffDays >= -1 && diffDays <= 90;
      })
      .sort((a, b) => Math.abs(saleTs - saleTime(a)) - Math.abs(saleTs - saleTime(b)));

    const donor = candidates[0];
    if (!donor) return sale;

    return {
      ...sale,
      funnel_id: sale.funnel_id || donor.funnel_id,
      meta_campaign_id: sale.meta_campaign_id || donor.meta_campaign_id,
      meta_adset_id: sale.meta_adset_id || donor.meta_adset_id,
      meta_ad_id: sale.meta_ad_id || donor.meta_ad_id,
      meta_campaign_name: sale.meta_campaign_name || donor.meta_campaign_name,
      meta_adset_name: sale.meta_adset_name || donor.meta_adset_name,
      meta_ad_name: sale.meta_ad_name || donor.meta_ad_name,
      utm_source: sale.utm_source || donor.utm_source,
      utm_campaign: sale.utm_campaign || donor.utm_campaign,
      utm_medium: sale.utm_medium || donor.utm_medium,
      utm_content: sale.utm_content || donor.utm_content,
      is_paid_traffic: sale.is_paid_traffic || hasMetaAttribution(donor),
    };
  });
}

/**
 * Agrega vendas de todas as plataformas por campanha / adset / ad.
 * Quando funnelProducts é fornecido, usa classificação dinâmica.
 */
export function useAllSalesAggregation(funnelId?: string | null, ingestionType?: string | null, funnelProducts?: FunnelProduct[], paidTrafficOnly?: boolean) {
  const needsProductFunnelFilter = Boolean(funnelId && funnelProducts && funnelProducts.length > 0);
  const { data: rawSales = [] } = useAllSales(needsProductFunnelFilter ? undefined : funnelId, ingestionType, false);
  const allSales = resolveInheritedAttribution(rawSales);
  const confirmed = allSales.filter(t => {
    if (t.status !== 'authorized') return false;
    if (funnelId && needsProductFunnelFilter) {
      // O PRODUTO define o funil: só conta as vendas dos produtos cadastrados no
      // funil (mapped_funnel_id, vindo de funnel_products). Não usamos funnel_id da
      // transação porque ele pode ser HERDADO de outra venda do mesmo cliente
      // (resolveInheritedAttribution) e puxar produtos de OUTRO funil para cá —
      // era isso que inflava o resumo do funil vs a KPI (ex.: "Combo Erveiros"
      // entrando no Guia de Tinturas). Assim o resumo do funil bate com a KPI.
      const belongsToFunnel = t.mapped_funnel_id === funnelId;
      if (!belongsToFunnel) return false;
    }
    return true;
  });
  // paidTrafficOnly NÃO pode filtrar `confirmed` inteiro: a aba "Vendas sem
  // tráfego" nasce justamente das vendas sem atribuição — filtrar antes
  // deixava organicTransactions sempre vazio. byCampaign/byAdset/byAd já são
  // naturalmente só-pagas (exigem meta_*_id); o flag afeta apenas totalSales.
  const confirmedForTotals = paidTrafficOnly ? confirmed.filter(hasMetaAttribution) : confirmed;

  const byCampaign: Record<string, SalesAggregation> = {};
  const byAdset: Record<string, SalesAggregation> = {};
  const byAd: Record<string, SalesAggregation> = {};

  function addToAgg(agg: SalesAggregation, revenue: number, type: string) {
    agg.sales_count++;
    agg.revenue += revenue;
    if (type === 'principal')  { agg.front_sales++;  agg.front_revenue  += revenue; }
    else if (type === 'bump1') { agg.bump_sales++;   agg.bump_revenue   += revenue; }
    else if (type === 'upsell1') { agg.upsell_sales++; agg.upsell_revenue += revenue; }
    else if (type === 'downsell') { agg.downsell_sales++; agg.downsell_revenue += revenue; }
  }

  for (const tx of confirmed) {
    const type = classifyWithProducts(tx, funnelProducts);
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
  const organicTransactions = confirmed.filter(t => !hasMetaAttribution(t));
  for (const tx of organicTransactions) {
    addToAgg(organicSales, tx.revenue, classifyWithProducts(tx, funnelProducts));
  }

  const totalSales = emptySalesAgg();
  for (const tx of confirmedForTotals) {
    addToAgg(totalSales, tx.revenue, classifyWithProducts(tx, funnelProducts));
  }

  return { byCampaign, byAdset, byAd, organicSales, totalSales, organicTransactions };
}

/** Retorna vendas do período anterior (mesma duração) */
export function usePrevPeriodAllSales(funnelId?: string | null) {
  const { dateRange, compareEnabled, lastUpdated } = useFilterStore();
  const durationDays = Math.round((dateRange.end.getTime() - dateRange.start.getTime()) / (24 * 60 * 60 * 1000));
  const prevEnd = new Date(dateRange.start);
  prevEnd.setDate(prevEnd.getDate() - 1);
  const prevStart = new Date(prevEnd);
  prevStart.setDate(prevStart.getDate() - durationDays);
  const dateFrom = toLocalDate(prevStart);
  const dateTo = toLocalDate(prevEnd);

  return useQuery({
    queryKey: ['all-sales-prev', dateFrom, dateTo, funnelId ?? 'all', lastUpdated.getTime()],
    queryFn: async () => fetchAllSalesRows(dateFrom, dateTo, funnelId),
    enabled: compareEnabled,
    ...SHARED_QUERY_OPTIONS,
  });
}
