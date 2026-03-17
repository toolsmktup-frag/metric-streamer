import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { classifyProduct, FRONT_PRODUCTS, type CustomerJourney } from '@/hooks/useCustomerJourney';
import type { CACOverride } from '@/hooks/useCACOverrides';

export interface CACProductRow {
  productKey: string;
  productLabel: string;
  totalSpend: number;       // R$ gasto em anúncios atribuídos ao produto
  newCustomers: number;     // clientes que entraram por este produto (entry product)
  cac: number;              // spend / newCustomers
  ltv30: number;
  ltv90: number;
  ltv180: number;
  ltv365: number;
  ratio30: number;          // ltv30 / cac
  ratio90: number;
  ratio180: number;
  ratio365: number;
  breakEvenDays: number | null; // estimativa de dias para LTV > CAC
  matchedCampaigns: string[];
}

export interface UnattributedCampaign {
  id: string;
  name: string;
  spend: number;
}

export interface CACSummary {
  rows: CACProductRow[];
  totalSpend: number;
  unattributedSpend: number;
  unattributedCampaigns: string[];
  unattributedDetails: UnattributedCampaign[]; // com id+spend para atribuição manual
  hasData: boolean;
}

// ─── Atribuição de spend por produto ───────────────────────────────
// Ordem de prioridade:
//   1. Override manual (cac_campaign_overrides) — usuário definiu explicitamente
//   2. Keyword match automático no nome da campanha (classifyProduct)
//   3. Não atribuído

function attributeSpendToProducts(
  campaigns: { id: string; name: string }[],
  insightsByCampaign: Record<string, number>,
  overridesBycampaign: Record<string, string>, // campaign_id → product_key
): {
  byProduct: Record<string, { spend: number; campaigns: string[] }>;
  unattributed: { spend: number; campaigns: string[]; details: UnattributedCampaign[] };
} {
  const byProduct: Record<string, { spend: number; campaigns: string[] }> = {};
  const unattributed = { spend: 0, campaigns: [] as string[], details: [] as UnattributedCampaign[] };

  for (const c of campaigns) {
    const spend = insightsByCampaign[c.id] || 0;
    if (spend === 0) continue;

    // Prioridade 1: override manual
    const overrideKey = overridesBycampaign[c.id];
    if (overrideKey) {
      if (!byProduct[overrideKey]) byProduct[overrideKey] = { spend: 0, campaigns: [] };
      byProduct[overrideKey].spend += spend;
      byProduct[overrideKey].campaigns.push(`${c.name} ★`);
      continue;
    }

    // Prioridade 2: keyword match automático
    const product = classifyProduct(c.name);
    if (product) {
      if (!byProduct[product.key]) byProduct[product.key] = { spend: 0, campaigns: [] };
      byProduct[product.key].spend += spend;
      byProduct[product.key].campaigns.push(c.name);
    } else {
      unattributed.spend += spend;
      unattributed.campaigns.push(c.name);
      unattributed.details.push({ id: c.id, name: c.name, spend });
    }
  }

  return { byProduct, unattributed };
}

// ─── LTV por janela para clientes de um produto de entrada ─────────

function calcLTVForProduct(
  journeys: CustomerJourney[],
  productKey: string,
): { ltv30: number; ltv90: number; ltv180: number; ltv365: number } {
  const customers = journeys.filter(j => j.entryProductKey === productKey);
  if (customers.length === 0) return { ltv30: 0, ltv90: 0, ltv180: 0, ltv365: 0 };

  const windows = [30, 90, 180, 365];
  const [ltv30, ltv90, ltv180, ltv365] = windows.map(days => {
    const revenues = customers.map(j => {
      const cutoff = new Date(j.firstPurchaseAt.getTime() + days * 86400000);
      return j.purchases.filter(p => p.purchasedAt <= cutoff).reduce((s, p) => s + p.amount, 0);
    });
    return revenues.reduce((s, r) => s + r, 0) / revenues.length;
  });

  return { ltv30, ltv90, ltv180, ltv365 };
}

// ─── Estimativa de break-even ──────────────────────────────────────

function estimateBreakEvenDays(cac: number, ltv30: number, ltv90: number, ltv180: number, ltv365: number): number | null {
  const points = [
    { days: 30, ltv: ltv30 },
    { days: 90, ltv: ltv90 },
    { days: 180, ltv: ltv180 },
    { days: 365, ltv: ltv365 },
  ];
  for (let i = 0; i < points.length; i++) {
    if (points[i].ltv >= cac) {
      if (i === 0) return 30;
      // Linear interpolation between i-1 and i
      const prev = points[i - 1];
      const curr = points[i];
      const t = (cac - prev.ltv) / (curr.ltv - prev.ltv);
      return Math.round(prev.days + t * (curr.days - prev.days));
    }
  }
  return null; // não atinge break-even em 365d
}

// ─── Hook ──────────────────────────────────────────────────────────

async function fetchCACData(
  journeys: CustomerJourney[],
  dateFrom: string,
  dateTo: string,
  overrides: CACOverride[],
): Promise<CACSummary> {
  // 1. Fetch campaigns + insights
  const [campaignsRes, insightsRes] = await Promise.all([
    supabase.from('meta_campaigns').select('id, name'),
    supabase
      .from('meta_insights')
      .select('object_id, spend')
      .eq('object_type', 'campaign')
      .gte('date_start', dateFrom)
      .lte('date_start', dateTo),
  ]);

  const campaigns = (campaignsRes.data || []) as { id: string; name: string }[];
  const insights = (insightsRes.data || []) as { object_id: string; spend: number }[];

  // 2. Aggregate spend by campaign_id
  const insightsByCampaign: Record<string, number> = {};
  for (const ins of insights) {
    insightsByCampaign[ins.object_id] = (insightsByCampaign[ins.object_id] || 0) + Number(ins.spend);
  }

  const totalSpend = Object.values(insightsByCampaign).reduce((s, v) => s + v, 0);
  const hasData = totalSpend > 0 || campaigns.length > 0;

  if (!hasData) {
    return { rows: [], totalSpend: 0, unattributedSpend: 0, unattributedCampaigns: [], unattributedDetails: [], hasData: false };
  }

  // 3. Build override map: campaign_id → product_key
  const overridesByCampaign: Record<string, string> = {};
  for (const o of overrides) overridesByCampaign[o.campaign_id] = o.product_key;

  // 4. Attribute spend to products (override → keyword → unattributed)
  const { byProduct, unattributed } = attributeSpendToProducts(campaigns, insightsByCampaign, overridesByCampaign);

  // 4. Build rows for front-end products only
  // ⚠️ newCustomers DEVE ser filtrado pelo mesmo período do spend.
  // Sem esse filtro, dividimos gasto recente por todos os clientes históricos
  // → CAC artificialmente baixo (ex: R$0,75 em vez de R$15+).
  const dateFromDt = new Date(dateFrom + 'T00:00:00');
  const dateToDt   = new Date(dateTo   + 'T23:59:59');

  const rows: CACProductRow[] = FRONT_PRODUCTS.map(product => {
    const spendInfo = byProduct[product.key] || { spend: 0, campaigns: [] };
    // Conta apenas clientes cuja PRIMEIRA COMPRA REAL (incluindo não-classificadas)
    // ocorreu no período. Usa trueFirstPurchaseAt para evitar contar clientes antigos
    // que já estavam na base e apenas compraram este produto depois.
    const newCustomers = journeys.filter(j =>
      j.entryProductKey === product.key &&
      j.trueFirstPurchaseAt >= dateFromDt &&
      j.trueFirstPurchaseAt <= dateToDt
    ).length;
    const cac = newCustomers > 0 ? spendInfo.spend / newCustomers : 0;
    // LTV usa todos os clientes históricos do produto → expectativa realista de LTV futuro
    const { ltv30, ltv90, ltv180, ltv365 } = calcLTVForProduct(journeys, product.key);

    return {
      productKey: product.key,
      productLabel: product.label,
      totalSpend: spendInfo.spend,
      newCustomers,
      cac,
      ltv30, ltv90, ltv180, ltv365,
      ratio30:  cac > 0 ? ltv30  / cac : 0,
      ratio90:  cac > 0 ? ltv90  / cac : 0,
      ratio180: cac > 0 ? ltv180 / cac : 0,
      ratio365: cac > 0 ? ltv365 / cac : 0,
      breakEvenDays: cac > 0 ? estimateBreakEvenDays(cac, ltv30, ltv90, ltv180, ltv365) : null,
      matchedCampaigns: spendInfo.campaigns,
    };
  }).filter(r => r.totalSpend > 0 || r.newCustomers > 0);

  return {
    rows,
    totalSpend,
    unattributedSpend: unattributed.spend,
    unattributedCampaigns: unattributed.campaigns,
    unattributedDetails: unattributed.details,
    hasData: true,
  };
}

export function useCAC(
  journeys: CustomerJourney[],
  dateFrom: string,
  dateTo: string,
  overrides: CACOverride[] = [],
) {
  return useQuery({
    queryKey: ['cac', dateFrom, dateTo, journeys.length, overrides.length],
    queryFn: () => fetchCACData(journeys, dateFrom, dateTo, overrides),
    enabled: journeys.length > 0,
    staleTime: 10 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    refetchOnWindowFocus: false,
  });
}
