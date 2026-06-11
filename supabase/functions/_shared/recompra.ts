// ════════════════════════════════════════════════════════════════════
// Cálculo de recompra/recontato baseado em QUANTIDADE de potes.
//
// ⚠️  ESPELHO de src/lib/recompra.ts — MANTER OS DOIS EM SINCRONIA.
//     Esta cópia roda no edge (Deno) porque o front não pode ser importado.
//     addDays/differenceInDays são reimplementados aqui (sem date-fns) com a
//     mesma semântica usada no front (truncamento em direção a zero).
//
// Regra de negócio (definida pelo dono):
//  - 1 pote = 30 dias de consumo → duração = quantidade × 30.
//  - Recontatar X dias ANTES do estoque acabar (antecedência por faixa).
//  - Múltiplas compras SOMAM (estoque que estende).
//  - Fonte de data: data real da compra (customer_purchases.purchased_at).
// ════════════════════════════════════════════════════════════════════

export const DAYS_PER_POT = 30;
const MS_PER_DAY = 86400000;

/** Compras cuja quantidade foi resolvida como potes (encapsulados). */
export const POT_SOURCES = new Set(["mapping", "parser_potes", "parser_dias"]);

function addDays(date: Date, n: number): Date {
  return new Date(date.getTime() + n * MS_PER_DAY);
}

/** Full days entre duas datas, truncado em direção a zero (igual date-fns). */
function differenceInDays(a: Date, b: Date): number {
  return Math.trunc((a.getTime() - b.getTime()) / MS_PER_DAY);
}

export interface RecompraPurchase {
  date: Date;
  quantity: number;
}

export interface DurationTier {
  durationDays: number;
  reminderDaysBefore: number;
}

export interface RecompraComputed {
  totalPots: number;
  totalDays: number;
  stockEndsAt: Date;
  recontactAt: Date;
  daysRemaining: number;
  reminderDaysBefore: number;
}

/** Maior faixa cuja duração ≤ total (ou a menor faixa, se total < todas). */
export function pickTier<T extends DurationTier>(tiers: T[], totalDays: number): T | null {
  if (!tiers.length) return null;
  const sorted = [...tiers].sort((a, b) => a.durationDays - b.durationDays);
  let chosen = sorted[0];
  for (const t of sorted) {
    if (t.durationDays <= totalDays) chosen = t;
  }
  return chosen;
}

export function pickReminderDays(tiers: DurationTier[], totalDays: number): number {
  return pickTier(tiers, totalDays)?.reminderDaysBefore ?? 0;
}

/**
 * Calcula o estoque acumulado e o dia de recontato de um cliente.
 * @returns null se o cliente não tem nenhuma compra de pote válida
 */
export function computeRecompra(
  purchases: RecompraPurchase[],
  tiers: DurationTier[],
  today: Date,
  daysPerPot = DAYS_PER_POT,
): RecompraComputed | null {
  const valid = purchases.filter(
    (p) => p.quantity > 0 && p.date instanceof Date && !Number.isNaN(p.date.getTime()),
  );
  if (valid.length === 0) return null;

  const sorted = [...valid].sort((a, b) => a.date.getTime() - b.date.getTime());

  let stockEndsAt: Date | null = null;
  let totalPots = 0;
  for (const p of sorted) {
    totalPots += p.quantity;
    const days = p.quantity * daysPerPot;
    if (stockEndsAt && stockEndsAt.getTime() > p.date.getTime()) {
      stockEndsAt = addDays(stockEndsAt, days);
    } else {
      stockEndsAt = addDays(p.date, days);
    }
  }
  if (!stockEndsAt) return null;

  const totalDays = totalPots * daysPerPot;
  const reminderDaysBefore = pickReminderDays(tiers, totalDays);
  const recontactAt = addDays(stockEndsAt, -reminderDaysBefore);
  const daysRemaining = differenceInDays(recontactAt, today);

  return { totalPots, totalDays, stockEndsAt, recontactAt, daysRemaining, reminderDaysBefore };
}
