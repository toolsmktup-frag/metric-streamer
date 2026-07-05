import { useMemo } from 'react';
import { parseLocalDateTime } from '@/lib/localDate';
import { computeRecompra, pickTier, type DurationTier, type RecompraPurchase } from '@/lib/recompra';
import type { Lead, LeadStagePosition } from '@/types/leadFunnels';
import type { LeadProductMapping } from '@/hooks/useLeadProductMappings';
import type { PurchaseSummary } from '@/hooks/useBulkLeadPurchases';
import type { LeadPurchaseInfo } from '@/hooks/useBulkLeadPurchaseProducts';

export interface RecontactProduct {
  id?: string;
  product_name_contains: string;
  display_name?: string | null;
  recontact_days: number | null;
  pot_duration_days?: number | null;
  reminder_days_before?: number | null;
}

export interface RecontactInfo {
  daysRemaining: number;
  isOverdue: boolean;
  deadlineDate: Date;
  productName: string;
  recontactDays: number;
  matchedProductId?: string;
  totalPots: number;
  /** Explicação do cálculo p/ tooltip: compras que sustentam o timer + datas. */
  breakdown: string;
}

/** Compras cuja quantidade foi resolvida como potes (encapsulados). */
const POT_SOURCES = new Set(['mapping', 'parser_potes', 'parser_dias']);

interface FunnelTier extends DurationTier {
  productId?: string;
}

/**
 * Para cada lead, calcula o dia de recontato com base na QUANTIDADE de potes
 * comprada (1 pote = 30 dias), somando o estoque de múltiplas compras e
 * recontatando a antecedência configurada antes de o estoque acabar.
 *
 * Fonte de data: SOMENTE compras reais de `customer_purchases` (via
 * useBulkLeadPurchaseProducts). Sem fallback de metadata — leads sem compra
 * de pote simplesmente não recebem badge (em vez do antigo "-979d").
 *
 * A config do funil define as faixas (pot_duration_days / reminder_days_before).
 */
export function useRecontactDeadlines(
  positions: (LeadStagePosition & { lead: Lead })[],
  products: RecontactProduct[] | undefined,
  _mappings?: LeadProductMapping[],
  _purchaseMap?: Map<string, PurchaseSummary>,
  leadPurchaseInfoMap?: Map<string, LeadPurchaseInfo>,
): Map<string, RecontactInfo> {
  return useMemo(() => {
    const map = new Map<string, RecontactInfo>();

    // Faixas de duração/antecedência a partir da config do funil.
    const tiers: FunnelTier[] = [];
    for (const p of products || []) {
      if (p.pot_duration_days != null && p.reminder_days_before != null) {
        tiers.push({
          durationDays: p.pot_duration_days,
          reminderDaysBefore: p.reminder_days_before,
          productId: p.id,
        });
      }
    }
    // Funil sem config de duração → sem badges de recompra.
    if (tiers.length === 0) return map;

    const today = new Date();

    for (const pos of positions) {
      const info = leadPurchaseInfoMap?.get(pos.lead_id);
      if (!info?.purchases?.length) continue;

      // Apenas compras identificadas como potes, com data e quantidade válidas.
      const potPurchases: RecompraPurchase[] = [];
      for (const pur of info.purchases) {
        if (!pur.quantitySource || !POT_SOURCES.has(pur.quantitySource)) continue;
        if (!pur.quantity || pur.quantity <= 0) continue;
        const d = parseLocalDateTime(pur.date);
        if (!d) continue;
        potPurchases.push({ date: d, quantity: pur.quantity });
      }
      if (potPurchases.length === 0) continue;

      const r = computeRecompra(potPurchases, tiers, today);
      if (!r) continue;

      // Produto da faixa correspondente ao total (usado pelo auto-move).
      const tier = pickTier(tiers, r.totalDays);

      // Tooltip explicando o cálculo (evita "timer não bate" quando o
      // estoque vem de compra antiga com vários potes).
      const fmt = (d: Date) =>
        `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
      const comprasStr = [...potPurchases]
        .sort((a, b) => a.date.getTime() - b.date.getTime())
        .map((p) => `${fmt(p.date)} ×${p.quantity}`)
        .join(', ');
      const breakdown =
        `${r.totalPots} pote${r.totalPots > 1 ? 's' : ''} (1 pote = 30 dias)\n` +
        `Compras: ${comprasStr}\n` +
        `Estoque acaba: ${fmt(r.stockEndsAt)}\n` +
        `Recontato: ${fmt(r.recontactAt)} (${r.reminderDaysBefore}d antes)`;

      map.set(pos.lead_id, {
        daysRemaining: r.daysRemaining,
        isOverdue: r.daysRemaining < 0,
        deadlineDate: r.recontactAt,
        productName: `${r.totalPots} pote${r.totalPots > 1 ? 's' : ''}`,
        recontactDays: r.totalDays - r.reminderDaysBefore,
        matchedProductId: tier?.productId,
        totalPots: r.totalPots,
        breakdown,
      });
    }

    return map;
  }, [positions, products, leadPurchaseInfoMap]);
}
