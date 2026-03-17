import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

// ─── Product catalog ───────────────────────────────────────────────
export type ProductType = 'front' | 'backend' | 'physical';

export interface ProductDef {
  key: string;
  label: string;
  type: ProductType;
  patterns: string[];
}

export const PRODUCTS: ProductDef[] = [
  // ── Fronts ──
  // IMPORTANTE: padrões mais específicos primeiro para evitar falsos positivos
  { key: 'guia_tinturas',    label: 'Guia de Tinturas',                        type: 'front',    patterns: ['como preparar tinturas', 'guia de preparo de tinturas', 'guia de tinturas', 'preparo de tinturas de ervas'] },
  { key: 'manual_ervas',     label: 'Manual das Ervas para Dores',              type: 'front',    patterns: ['manual das ervas', 'manual ervas', 'ervas para tratar', 'ervas para dores'] },
  { key: 'por_que_doentes',  label: 'Por que ficamos doentes',                  type: 'front',    patterns: ['ficamos doentes', 'por que ficamos', 'causa das dores com plantas'] },
  // ── Back-end ──
  { key: 'curso_erveiros',   label: 'Curso dos Erveiros',                       type: 'backend',  patterns: ['curso dos erveiros', 'acesso estendido ao curso', 'black friday dos erveiros'] },
  { key: 'super_combo',      label: 'Super Combo Erveiro Master',               type: 'backend',  patterns: ['super combo', 'erveiro master', 'combo dos erveiros'] },
  { key: 'mestre_tinturas',  label: 'Mestre das Tinturas',                      type: 'backend',  patterns: ['mestre das tinturas', 'mestre em tinturas', 'curso mestre das tinturas', 'curso mestre em tinturas'] },
  { key: 'mestre_meis',      label: 'Mestre em Méis Medicinais',                type: 'backend',  patterns: ['méis', 'meis', 'mel medicinal'] },
  { key: 'clube_secreto',    label: 'Clube Secreto das Plantas',                type: 'backend',  patterns: ['clube', 'revista', 'apostila', 'soulnaturi', 'clube secreto'] },
  { key: 'combo_mestres',    label: 'Combo dos Mestres',                        type: 'backend',  patterns: ['combo mestre', 'combo dos mestres', 'combo mestres'] },
  { key: 'alinhamento',      label: 'Alinhamento com Ervas',                    type: 'backend',  patterns: ['alinhamento'] },
  { key: 'revolucao_ser',    label: 'Revolução do Ser / Despertar',             type: 'backend',  patterns: ['revolução do ser', 'revolucao do ser', 'equilibradamente', 'despertar da vida plena', 'portal fluxo do ser', 'trilha do despertar', 'fluxo do ser'] },
  { key: 'diabetes',         label: 'Programa Diabetes Sem Segredos',           type: 'backend',  patterns: ['diabetes'] },
  { key: 'oficina_ervas',    label: 'Oficina das Ervas',                        type: 'backend',  patterns: ['oficina das ervas', 'gravação oficina', 'gravacao oficina', 'workshop com matheus', 'adquira junto'] },
  { key: 'guia_chas',        label: 'Guia de Chás',                             type: 'backend',  patterns: ['chá', 'cha', 'xarope', 'poder medicinal dos chás', 'poder medicinal dos chas', 'guia de preparo dos chás', 'guia de preparo dos chas'] },
  { key: 'despertar',        label: 'Despertar do Erveiro / Código das Ervas',  type: 'backend',  patterns: ['despertar do erveiro', 'código das ervas', 'codigo das ervas', 'despertar erveiro'] },
  { key: 'frequencias',      label: 'Frequências Sonoras',                      type: 'backend',  patterns: ['frequência', 'frequencia', 'sonoras'] },
  // ── Físicos ──
  { key: 'supervita',        label: 'Supervita',                                type: 'physical', patterns: ['supervita'] },
  { key: 'articulabem',      label: 'Articulabem',                              type: 'physical', patterns: ['articulabem', 'articula bem'] },
];

export const FRONT_PRODUCTS = PRODUCTS.filter(p => p.type === 'front');
export const BACKEND_PRODUCTS = PRODUCTS.filter(p => p.type === 'backend');
export const PHYSICAL_PRODUCTS = PRODUCTS.filter(p => p.type === 'physical');

export function classifyProduct(name: string): ProductDef | null {
  if (!name) return null;
  const lower = name.toLowerCase();
  for (const p of PRODUCTS) {
    if (p.patterns.some(pat => lower.includes(pat.toLowerCase()))) return p;
  }
  return null;
}

// ─── Types ─────────────────────────────────────────────────────────
export interface Purchase {
  productKey: string;
  productLabel: string;
  productType: ProductType;
  purchasedAt: Date;
  amount: number;
  platform: string;
}

export interface CustomerJourney {
  customerId: string;
  purchases: Purchase[];         // sorted by date (classified only)
  totalSpent: number;
  firstPurchaseAt: Date;         // primeira compra CLASSIFICADA (entry product)
  trueFirstPurchaseAt: Date;     // primeira compra REAL (inclui não-classificadas)
  lastPurchaseAt: Date;
  entryProductKey: string | null;
  productKeys: Set<string>;      // set of all products bought
}

// ─── Raw fetch ─────────────────────────────────────────────────────

interface NormalizedRow {
  customer_id: string;
  product_name: string;
  amount: number; // in BRL (reais)
  purchased_at: string;
  platform: string;
}

async function fetchAllPurchases(): Promise<NormalizedRow[]> {
  // fn_customer_journeys() unifica identidade via customer_identity_links:
  // clientes que compraram na Guru E na Ticto aparecem com o mesmo
  // unified_customer_id, evitando fragmentação de LTV/CPA.
  const normalized: NormalizedRow[] = [];
  let from = 0;
  const pageSize = 1000;

  while (true) {
    const { data, error } = await supabase
      .rpc('fn_customer_journeys')
      .range(from, from + pageSize - 1);
    if (error || !data || data.length === 0) break;
    for (const row of data as any[]) {
      normalized.push({
        customer_id: row.customer_id,
        product_name: row.product_name || '',
        amount: Number(row.amount) || 0,
        purchased_at: row.purchased_at,
        platform: row.platform,
      });
    }
    if (data.length < pageSize) break;
    from += pageSize;
  }

  return normalized;
}

// ─── Build journeys ────────────────────────────────────────────────
function buildJourneys(rawPurchases: NormalizedRow[]): CustomerJourney[] {
  const byCustomer: Record<string, NormalizedRow[]> = {};
  for (const row of rawPurchases) {
    if (!row.customer_id) continue;
    if (!byCustomer[row.customer_id]) byCustomer[row.customer_id] = [];
    byCustomer[row.customer_id].push(row);
  }

  const journeys: CustomerJourney[] = [];
  for (const [customerId, rows] of Object.entries(byCustomer)) {
    // trueFirstPurchaseAt: mínimo de TODAS as compras (inclui não-classificadas).
    // Corrige o bug onde clientes antigos com compras sem match de padrão
    // apareciam como "novos" porque a primeira CLASSIFICADA caía no período.
    const trueFirstPurchaseAt = rows.reduce<Date>((min, r) => {
      const d = new Date(r.purchased_at);
      return d < min ? d : min;
    }, new Date(rows[0].purchased_at));

    const purchases: Purchase[] = [];
    for (const row of rows) {
      const def = classifyProduct(row.product_name);
      if (!def) continue;
      purchases.push({
        productKey: def.key,
        productLabel: def.label,
        productType: def.type,
        purchasedAt: new Date(row.purchased_at),
        amount: row.amount,
        platform: row.platform,
      });
    }
    if (!purchases.length) continue;
    purchases.sort((a, b) => a.purchasedAt.getTime() - b.purchasedAt.getTime());

    const entry = purchases[0];
    journeys.push({
      customerId,
      purchases,
      totalSpent: purchases.reduce((s, p) => s + p.amount, 0),
      firstPurchaseAt: entry.purchasedAt,
      trueFirstPurchaseAt,
      lastPurchaseAt: purchases[purchases.length - 1].purchasedAt,
      entryProductKey: entry.productKey,
      productKeys: new Set(purchases.map(p => p.productKey)),
    });
  }
  return journeys;
}

// ─── Hook ──────────────────────────────────────────────────────────
export function useCustomerJourney(enabled = true) {
  return useQuery({
    queryKey: ['customer-journey'],
    queryFn: async () => {
      const raw = await fetchAllPurchases();
      return buildJourneys(raw);
    },
    enabled,
    staleTime: 10 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    refetchOnWindowFocus: false,
  });
}

// ─── Analysis helpers ──────────────────────────────────────────────

/** Escada de Valor: para cada front, quais produtos back-end foram comprados e qual % */
export function calcEscadaValor(journeys: CustomerJourney[]) {
  return FRONT_PRODUCTS.map(front => {
    const customers = journeys.filter(j => j.entryProductKey === front.key);
    const total = customers.length;
    const ascended = customers.filter(j => j.purchases.length > 1).length;

    const backendCounts: Record<string, number> = {};
    for (const j of customers) {
      for (const p of j.purchases) {
        if (p.productKey !== front.key) {
          backendCounts[p.productKey] = (backendCounts[p.productKey] || 0) + 1;
        }
      }
    }

    const backendStats = PRODUCTS
      .filter(p => p.key !== front.key)
      .map(p => ({
        product: p,
        count: backendCounts[p.key] || 0,
        pct: total > 0 ? ((backendCounts[p.key] || 0) / total) * 100 : 0,
      }))
      .filter(s => s.count > 0)
      .sort((a, b) => b.count - a.count);

    // Avg days to first backend purchase
    const daysToNext = customers
      .filter(j => j.purchases.length > 1)
      .map(j => {
        const firstBack = j.purchases.find(p => p.productKey !== front.key);
        return firstBack
          ? (firstBack.purchasedAt.getTime() - j.firstPurchaseAt.getTime()) / 86400000
          : null;
      })
      .filter(d => d !== null) as number[];

    const avgDaysToNext = daysToNext.length
      ? Math.round(daysToNext.reduce((s, d) => s + d, 0) / daysToNext.length)
      : null;

    return { front, total, ascended, ascendedPct: total > 0 ? (ascended / total) * 100 : 0, backendStats, avgDaysToNext };
  });
}

/** Retorna a data da primeira compra de um produto por um cliente */
function firstBuyDate(j: CustomerJourney, productKey: string): Date | null {
  const p = j.purchases.find(p => p.productKey === productKey);
  return p ? p.purchasedAt : null;
}

/**
 * Cross-sell: quem comprou prodA (+ opcional prodB) → % que comprou target DEPOIS.
 * ⚠️ Filtro temporal: target só conta se comprado APÓS prodA (causa → efeito real).
 * Sem isso, clientes que compraram target primeiro distorciam o percentual.
 */
export function calcCrossSell(
  journeys: CustomerJourney[],
  prodA: string,
  prodB: string | null,
  target: string,
) {
  const withA = journeys.filter(j => j.productKeys.has(prodA));
  const withAB = prodB ? withA.filter(j => j.productKeys.has(prodB)) : withA;

  // Target deve ter sido comprado DEPOIS de prodA
  const withAConverted = withA.filter(j => {
    const dateA = firstBuyDate(j, prodA);
    const dateT = firstBuyDate(j, target);
    return dateA !== null && dateT !== null && dateT > dateA;
  });

  // Target deve ter sido comprado DEPOIS de prodA E prodB
  const withABConverted = withAB.filter(j => {
    const dateA  = firstBuyDate(j, prodA);
    const dateB  = prodB ? firstBuyDate(j, prodB) : dateA;
    const dateT  = firstBuyDate(j, target);
    const anchor = dateA && dateB ? (dateA > dateB ? dateA : dateB) : (dateA ?? dateB);
    return anchor !== null && dateT !== null && dateT > anchor;
  });

  return {
    onlyA: {
      total: withA.length,
      converted: withAConverted.length,
      pct: withA.length > 0 ? (withAConverted.length / withA.length) * 100 : 0,
    },
    withAB: prodB ? {
      total: withAB.length,
      converted: withABConverted.length,
      pct: withAB.length > 0 ? (withABConverted.length / withAB.length) * 100 : 0,
    } : null,
  };
}

/** LTV: receita média acumulada por front em diferentes janelas de tempo */
export function calcLTV(journeys: CustomerJourney[], windows = [30, 60, 90, 180, 365]) {
  return FRONT_PRODUCTS.map(front => {
    const customers = journeys.filter(j => j.entryProductKey === front.key);
    const windowData = windows.map(days => {
      const revenues = customers.map(j => {
        const cutoff = new Date(j.firstPurchaseAt.getTime() + days * 86400000);
        return j.purchases
          .filter(p => p.purchasedAt <= cutoff)
          .reduce((s, p) => s + p.amount, 0);
      });
      const avg = revenues.length ? revenues.reduce((s, r) => s + r, 0) / revenues.length : 0;
      return { days, avgLTV: avg };
    });
    return { front, total: customers.length, windowData };
  });
}

/** Sequências mais comuns (top N) */
export function calcTopSequences(journeys: CustomerJourney[], topN = 10) {
  const seqCount: Record<string, number> = {};
  for (const j of journeys) {
    if (j.purchases.length < 2) continue;
    // Deduplicate consecutive same products
    const seq: string[] = [];
    let last = '';
    for (const p of j.purchases) {
      if (p.productKey !== last) { seq.push(p.productLabel); last = p.productKey; }
    }
    if (seq.length < 2) continue;
    const key = seq.join(' → ');
    seqCount[key] = (seqCount[key] || 0) + 1;
  }
  return Object.entries(seqCount)
    .sort((a, b) => b[1] - a[1])
    .slice(0, topN)
    .map(([seq, count]) => ({ seq, count }));
}

/** Perfis: colecionadores (3+ produtos), compradores de físico */
export function calcPerfis(journeys: CustomerJourney[]) {
  const collectors = journeys.filter(j => j.productKeys.size >= 3);
  const physicalBuyers = journeys.filter(j =>
    [...j.productKeys].some(k => PHYSICAL_PRODUCTS.some(p => p.key === k))
  );
  const highLTV = [...journeys]
    .sort((a, b) => b.totalSpent - a.totalSpent)
    .slice(0, Math.ceil(journeys.length * 0.2));

  // Physical buyers: which digital product preceded physical most?
  const priorToPhysical: Record<string, number> = {};
  for (const j of physicalBuyers) {
    const firstPhysical = j.purchases.find(p => PHYSICAL_PRODUCTS.some(ph => ph.key === p.productKey));
    if (!firstPhysical) continue;
    for (const p of j.purchases) {
      if (p.purchasedAt < firstPhysical.purchasedAt && !PHYSICAL_PRODUCTS.some(ph => ph.key === p.productKey)) {
        priorToPhysical[p.productLabel] = (priorToPhysical[p.productLabel] || 0) + 1;
      }
    }
  }

  return {
    collectors: {
      count: collectors.length,
      pct: journeys.length > 0 ? (collectors.length / journeys.length) * 100 : 0,
      avgSpent: collectors.length ? collectors.reduce((s, j) => s + j.totalSpent, 0) / collectors.length : 0,
    },
    physicalBuyers: {
      count: physicalBuyers.length,
      pct: journeys.length > 0 ? (physicalBuyers.length / journeys.length) * 100 : 0,
      avgSpent: physicalBuyers.length ? physicalBuyers.reduce((s, j) => s + j.totalSpent, 0) / physicalBuyers.length : 0,
      priorProducts: Object.entries(priorToPhysical)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([label, count]) => ({ label, count })),
    },
    highLTV: {
      count: highLTV.length,
      minSpent: highLTV.length ? highLTV[highLTV.length - 1].totalSpent : 0,
      avgSpent: highLTV.length ? highLTV.reduce((s, j) => s + j.totalSpent, 0) / highLTV.length : 0,
      entryProducts: FRONT_PRODUCTS.map(f => ({
        label: f.label,
        count: highLTV.filter(j => j.entryProductKey === f.key).length,
      })).filter(e => e.count > 0).sort((a, b) => b.count - a.count),
    },
  };
}
