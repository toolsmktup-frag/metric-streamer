import { addDays, differenceInDays } from 'date-fns';

// ════════════════════════════════════════════════════════════════════
// Cálculo de recompra/recontato baseado em QUANTIDADE de potes.
//
// Regra de negócio (definida pelo dono):
//  - 1 pote = 30 dias de consumo → duração = quantidade × 30.
//  - Recontatar X dias ANTES do estoque acabar (antecedência por faixa de
//    duração, vinda da config do funil: 30d→7, 90/180d→15, 270/360d→20).
//  - Múltiplas compras SOMAM (estoque que estende): se o cliente recompra
//    antes de acabar, os dias da nova compra se somam ao estoque restante;
//    se o estoque já zerou, o ciclo reinicia na data da nova compra.
//  - Fonte de data: data real da compra (customer_purchases.purchased_at).
// ════════════════════════════════════════════════════════════════════

export const DAYS_PER_POT = 30;

export interface RecompraPurchase {
  date: Date;
  quantity: number;
}

/** Faixa de duração → antecedência do lembrete (da config do funil). */
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

/** Maior faixa cuja duração ≤ total (ou a menor faixa, se total for menor que todas). */
export function pickTier<T extends DurationTier>(tiers: T[], totalDays: number): T | null {
  if (!tiers.length) return null;
  const sorted = [...tiers].sort((a, b) => a.durationDays - b.durationDays);
  let chosen = sorted[0];
  for (const t of sorted) {
    if (t.durationDays <= totalDays) chosen = t;
  }
  return chosen;
}

/** Antecedência da faixa correspondente ao total de dias. */
export function pickReminderDays(tiers: DurationTier[], totalDays: number): number {
  return pickTier(tiers, totalDays)?.reminderDaysBefore ?? 0;
}

/**
 * Calcula o estoque acumulado e o dia de recontato de um cliente.
 * @param purchases compras de potes do cliente (apenas itens que são potes)
 * @param tiers faixas de duração/antecedência configuradas no funil
 * @param today referência de "hoje"
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

  // Ordena por data crescente para simular o consumo do estoque.
  const sorted = [...valid].sort((a, b) => a.date.getTime() - b.date.getTime());

  let stockEndsAt: Date | null = null;
  let totalPots = 0;
  for (const p of sorted) {
    totalPots += p.quantity;
    const days = p.quantity * daysPerPot;
    if (stockEndsAt && stockEndsAt.getTime() > p.date.getTime()) {
      // ainda tinha estoque → a nova compra estende o prazo
      stockEndsAt = addDays(stockEndsAt, days);
    } else {
      // estoque já havia zerado → reinicia na data desta compra
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
