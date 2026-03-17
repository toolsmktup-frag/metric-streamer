import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export type RFMSegment =
  | 'champions'
  | 'loyal'
  | 'potential'
  | 'new_customers'
  | 'at_risk'
  | 'regular'
  | 'hibernating'
  | 'lost';

export const SEGMENT_ORDER: RFMSegment[] = [
  'champions', 'loyal', 'potential', 'new_customers',
  'at_risk', 'regular', 'hibernating', 'lost',
];

export const SEGMENT_CONFIG: Record<RFMSegment, {
  label: string;
  description: string;
  colorClass: string;
  badgeClass: string;
  cardClass: string;
  action: string;
  emoji: string;
}> = {
  champions: {
    label: 'Campeões',
    description: 'Compraram recentemente, com alta frequência e alto valor',
    colorClass: 'text-yellow-700 dark:text-yellow-400',
    badgeClass: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-300',
    cardClass: 'border-yellow-200 dark:border-yellow-800/50',
    action: 'Ofereça produtos exclusivos, peça indicações e crie programa VIP',
    emoji: '🏆',
  },
  loyal: {
    label: 'Leais',
    description: 'Compram com frequência e geram boa receita',
    colorClass: 'text-emerald-700 dark:text-emerald-400',
    badgeClass: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300',
    cardClass: 'border-emerald-200 dark:border-emerald-800/50',
    action: 'Programa de fidelidade, upsell premium, conteúdo exclusivo',
    emoji: '💚',
  },
  potential: {
    label: 'Potencial',
    description: 'Recentes com poucas compras mas com potencial de crescimento',
    colorClass: 'text-blue-700 dark:text-blue-400',
    badgeClass: 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300',
    cardClass: 'border-blue-200 dark:border-blue-800/50',
    action: 'Nurture com conteúdo e ofereça o próximo passo na escada de valor',
    emoji: '🌱',
  },
  new_customers: {
    label: 'Novos',
    description: 'Compraram pela primeira vez recentemente',
    colorClass: 'text-cyan-700 dark:text-cyan-400',
    badgeClass: 'bg-cyan-100 text-cyan-800 dark:bg-cyan-900/40 dark:text-cyan-300',
    cardClass: 'border-cyan-200 dark:border-cyan-800/50',
    action: 'Onboarding forte, upsell imediato e sequência de boas-vindas',
    emoji: '✨',
  },
  at_risk: {
    label: 'Em Risco',
    description: 'Eram bons clientes mas pararam de comprar há algum tempo',
    colorClass: 'text-orange-700 dark:text-orange-400',
    badgeClass: 'bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300',
    cardClass: 'border-orange-200 dark:border-orange-800/50',
    action: 'Campanha de reativação urgente com oferta especial limitada',
    emoji: '⚠️',
  },
  regular: {
    label: 'Regular',
    description: 'Perfil médio de compra',
    colorClass: 'text-slate-600 dark:text-slate-400',
    badgeClass: 'bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-300',
    cardClass: 'border-border',
    action: 'Engajamento com conteúdo e oferta de meio de funil',
    emoji: '👤',
  },
  hibernating: {
    label: 'Hibernando',
    description: 'Pouco ativo há bastante tempo',
    colorClass: 'text-purple-700 dark:text-purple-400',
    badgeClass: 'bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300',
    cardClass: 'border-purple-200 dark:border-purple-800/50',
    action: 'Sequência de reativação — lembre-os do valor que estão perdendo',
    emoji: '😴',
  },
  lost: {
    label: 'Perdidos',
    description: 'Sem compra há muito tempo',
    colorClass: 'text-red-700 dark:text-red-400',
    badgeClass: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300',
    cardClass: 'border-red-200 dark:border-red-800/50',
    action: 'Oferta de última chance — se não converter, aceite a perda',
    emoji: '❌',
  },
};

export interface RFMCustomer {
  email: string;
  name: string | null;
  recencyDays: number;
  frequency: number;
  monetary: number;
  rScore: number;
  fScore: number;
  mScore: number;
  segment: RFMSegment;
  lastPurchaseAt: Date;
  firstPurchaseAt: Date;
}

export interface RFMSegmentStats {
  count: number;
  pct: number;
  avgMonetary: number;
  avgRecencyDays: number;
  avgFrequency: number;
  totalRevenue: number;
}

export interface RFMSummary {
  customers: RFMCustomer[];
  bySegment: Record<RFMSegment, RFMSegmentStats>;
  totalCustomers: number;
  avgMonetary: number;
  avgRecencyDays: number;
  avgFrequency: number;
}

// ─── Scoring ────────────────────────────────────────────────────────

// Replica o comportamento de NTILE(5) do SQL para garantir segmentação idêntica
// entre frontend e backend.
function ntileScore(value: number, sortedAsc: number[], higherIsBetter: boolean): number {
  const n = sortedAsc.length;
  if (n === 0) return 3;
  // Primeira posição >= value no array ordenado (0-based)
  let idx = sortedAsc.findIndex(v => v >= value);
  if (idx === -1) idx = n - 1;
  // Rank 1-based em ordem ascendente
  const rank = idx + 1;
  // NTILE(5): ceil(rank * 5 / n), limitado a [1, 5]
  const tileAsc = Math.min(5, Math.max(1, Math.ceil((rank * 5) / n)));
  return higherIsBetter ? tileAsc : (6 - tileAsc);
}

// frequency = número real de compras (purchase_count), não o score
function assignSegment(r: number, f: number, m: number, frequency: number): RFMSegment {
  // Champions: top 40% em recência, frequência e monetário
  if (r >= 4 && f >= 4 && m >= 4) return 'champions';
  // Loyal: moderadamente recente + top 40% em F e M
  // Remove a condição ampla "r>=3 AND f>=3 AND m>=3" que inflava o segmento para 35%
  if (r >= 3 && f >= 4 && m >= 4) return 'loyal';
  // New: comprou exatamente 1 vez e está no top 40% de recência
  if (r >= 4 && frequency === 1) return 'new_customers';
  // Potential: recente mas com poucas compras — próximo passo na escada
  if (r >= 3 && f <= 2 && m <= 3) return 'potential';
  // At risk: eram top 40% em F ou M mas sumiram (inclui ex-campeões/leais inativos)
  if (r <= 2 && (f >= 3 || m >= 3)) return 'at_risk';
  // Lost: muito antigos, baixo engajamento
  if (r === 1 && f <= 2) return 'lost';
  // Hibernating: inativos com baixa frequência
  if (r <= 2 && f <= 2) return 'hibernating';
  // Regular: perfil médio — acima da mediana em recência mas sem destaque em F ou M
  return 'regular';
}

// ─── Data fetching ──────────────────────────────────────────────────

async function fetchRFMData(): Promise<RFMSummary> {
  // UTC timestamp para alinhar com NOW() do PostgreSQL (evita drift de timezone)
  const nowMs = Date.now();

  // fn_rfm_customers() unifica Guru + Ticto com identidade resolvida via
  // customer_identity_links — inclui todos os clientes, não só os da Ticto.
  const rows: {
    customer_id: string;
    email: string | null;
    name: string | null;
    total_revenue: number;
    purchase_count: number;
    last_purchase_at: string;
    first_purchase_at: string;
  }[] = [];

  let from = 0;
  while (true) {
    const { data, error } = await (supabase as any)
      .rpc('fn_rfm_customers')
      .range(from, from + 999);
    if (error || !data || data.length === 0) break;
    rows.push(...(data as any[]));
    if (data.length < 1000) break;
    from += 1000;
  }

  const rawCustomers = rows.map(r => {
    const lastDate  = new Date(r.last_purchase_at);
    const firstDate = new Date(r.first_purchase_at);
    // Email válido = contém '@'. UUID e strings sem '@' não são exibíveis como email.
    const validEmail = r.email && r.email.includes('@') ? r.email : null;
    const displayName = r.name || null;
    // Exibe: email válido > nome > "Cliente sem identificador" (nunca UUID)
    const displayEmail = validEmail || r.name || 'Cliente sem identificador';
    return {
      email: displayEmail,
      name: displayName,
      recencyDays: Math.max(0, Math.floor((nowMs - lastDate.getTime()) / 86400000)),
      frequency: Number(r.purchase_count),
      monetary: Number(r.total_revenue),
      lastPurchaseAt: lastDate,
      firstPurchaseAt: firstDate,
    };
  });

  if (rawCustomers.length === 0) {
    const empty: RFMSegmentStats = { count: 0, pct: 0, avgMonetary: 0, avgRecencyDays: 0, avgFrequency: 0, totalRevenue: 0 };
    return {
      customers: [],
      bySegment: Object.fromEntries(SEGMENT_ORDER.map(s => [s, { ...empty }])) as RFMSummary['bySegment'],
      totalCustomers: 0,
      avgMonetary: 0,
      avgRecencyDays: 0,
      avgFrequency: 0,
    };
  }

  const sortedR = [...rawCustomers.map(c => c.recencyDays)].sort((a, b) => a - b);
  const sortedF = [...rawCustomers.map(c => c.frequency)].sort((a, b) => a - b);
  const sortedM = [...rawCustomers.map(c => c.monetary)].sort((a, b) => a - b);

  const customers: RFMCustomer[] = rawCustomers.map(c => {
    const rScore = ntileScore(c.recencyDays, sortedR, false);
    const fScore = ntileScore(c.frequency, sortedF, true);
    const mScore = ntileScore(c.monetary, sortedM, true);
    return { ...c, rScore, fScore, mScore, segment: assignSegment(rScore, fScore, mScore, c.frequency) };
  });

  const bySegment = Object.fromEntries(
    SEGMENT_ORDER.map(seg => {
      const group = customers.filter(c => c.segment === seg);
      const n = group.length;
      return [seg, {
        count: n,
        pct: customers.length > 0 ? (n / customers.length) * 100 : 0,
        avgMonetary: n ? Math.round((group.reduce((s, c) => s + c.monetary, 0) / n) * 100) / 100 : 0,
        avgRecencyDays: n ? Math.round(group.reduce((s, c) => s + c.recencyDays, 0) / n) : 0,
        avgFrequency: n ? Math.round((group.reduce((s, c) => s + c.frequency, 0) / n) * 100) / 100 : 0,
        totalRevenue: group.reduce((s, c) => s + c.monetary, 0),
      } as RFMSegmentStats];
    })
  ) as RFMSummary['bySegment'];

  const total = customers.length;
  return {
    customers,
    bySegment,
    totalCustomers: total,
    avgMonetary: Math.round((customers.reduce((s, c) => s + c.monetary, 0) / total) * 100) / 100,
    avgRecencyDays: Math.round(customers.reduce((s, c) => s + c.recencyDays, 0) / total),
    avgFrequency: Math.round((customers.reduce((s, c) => s + c.frequency, 0) / total) * 100) / 100,
  };
}

// ─── Hook ───────────────────────────────────────────────────────────

export function useRFM() {
  return useQuery({
    queryKey: ['rfm'],
    queryFn: fetchRFMData,
    staleTime: 10 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    refetchOnWindowFocus: false,
  });
}
