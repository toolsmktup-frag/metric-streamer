/**
 * Unified transaction classification for funnel position.
 * 
 * Maps product_name + offer_name to a funnel role: principal, bump1, upsell1, or other.
 * This is the SINGLE SOURCE OF TRUTH — do NOT duplicate this logic elsewhere.
 * 
 * Uses the same patterns as the product catalog in useCustomerJourney.ts
 * but maps to funnel positions for aggregation purposes.
 */

export type FunnelPosition = 'principal' | 'bump1' | 'upsell1' | 'other';

export interface FunnelProductConfig {
  label: string;
  position: FunnelPosition;
  badgeLabel: string;
  /** If no sales exist, we DON'T hardcode a price — compute from actual data */
}

/**
 * Default funnel product display config.
 * Labels and badge names only — NO hardcoded prices.
 */
export const FUNNEL_PRODUCTS: Record<Exclude<FunnelPosition, 'other'>, FunnelProductConfig> = {
  principal: { label: 'Guia de Tinturas', position: 'principal', badgeLabel: 'Principal' },
  bump1:     { label: 'Guia dos Chás Originais', position: 'bump1', badgeLabel: 'Bump' },
  upsell1:   { label: 'Curso Mestre das Tinturas', position: 'upsell1', badgeLabel: 'Upsell' },
};

/**
 * Classify a transaction into its funnel position.
 * Accepts any object with product_name and/or offer_name fields.
 */
export function classifyTransaction(
  tx: { product_name?: string | null; offer_name?: string | null }
): FunnelPosition {
  const pn = (tx.product_name || '').toLowerCase();
  const on = (tx.offer_name || '').toLowerCase();

  // Order matters: check most specific first
  if (pn.includes('mestre das tinturas') || on.includes('oferta 197')) return 'upsell1';
  if (pn.includes('tinturas') && (on.includes('checkout principal') || on === '')) return 'principal';
  if (pn.includes('chás') || pn.includes('chas') || on.includes('bump')) return 'bump1';

  return 'other';
}

/**
 * Compute average unit price from actual revenue and count.
 * Returns 0 if no sales.
 */
export function avgUnitPrice(revenue: number, count: number): number {
  return count > 0 ? revenue / count : 0;
}
