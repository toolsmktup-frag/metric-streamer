import type { Lead, LeadStagePosition } from '@/types/leadFunnels';
import type { LeadPurchaseInfo } from '@/hooks/useBulkLeadPurchaseProducts';

export type ProductFilterMode = 'has' | 'not_has';
export type FinancialFilter = 'has_pending' | 'no_pending' | 'recover' | 'approved';

export interface KanbanFilters {
  products: { name: string; mode: ProductFilterMode }[];
  financial: FinancialFilter[];
}

export const EMPTY_FILTERS: KanbanFilters = { products: [], financial: [] };

export function isFiltersEmpty(f: KanbanFilters): boolean {
  return f.products.length === 0 && f.financial.length === 0;
}

export function countActiveFilters(f: KanbanFilters): number {
  return f.products.length + f.financial.length;
}

/**
 * Returns true if a lead/position matches ALL active filters.
 */
export function matchesFilters(
  position: LeadStagePosition & { lead: Lead },
  filters: KanbanFilters,
  purchaseProducts: Map<string, LeadPurchaseInfo> | undefined,
): boolean {
  if (isFiltersEmpty(filters)) return true;

  // --- Product filters (AND between rules) ---
  if (filters.products.length > 0) {
    const purchased = purchaseProducts?.get(position.lead_id)?.productNames || [];
    const purchasedLower = purchased.map(p => p.toLowerCase().trim());
    for (const rule of filters.products) {
      const target = rule.name.toLowerCase().trim();
      const hasIt = purchasedLower.some(p => p.includes(target) || target.includes(p));
      if (rule.mode === 'has' && !hasIt) return false;
      if (rule.mode === 'not_has' && hasIt) return false;
    }
  }

  // --- Financial filters (OR between options) ---
  if (filters.financial.length > 0) {
    const meta = position.lead.metadata || {};
    const status = String((meta as any).status || (meta as any).order_status || '').toLowerCase();
    const eventName = String((meta as any).last_event || (meta as any).event_name || '').toLowerCase();

    const isPending = /pix|boleto|aguardando|pending|waiting/.test(status)
      || /pix_generated|boleto|pending/.test(eventName);
    const isApproved = /authorized|paid|aprovado|approved|complete/.test(status)
      || /purchase|authorized/.test(eventName);
    const isRecover = /abandon|recus|refuse|reembol|refund|charge|cancel|rejected/.test(status)
      || /abandoned_cart|refused|refunded|chargeback|canceled/.test(eventName);

    let anyMatch = false;
    for (const f of filters.financial) {
      if (f === 'has_pending' && isPending) { anyMatch = true; break; }
      if (f === 'no_pending' && !isPending) { anyMatch = true; break; }
      if (f === 'recover' && isRecover) { anyMatch = true; break; }
      if (f === 'approved' && isApproved) { anyMatch = true; break; }
    }
    if (!anyMatch) return false;
  }

  return true;
}
