/**
 * Unified transaction classification for funnel position.
 * 
 * Delegates to classifyProduct() from useCustomerJourney.ts for rich pattern matching,
 * then maps the product key to a funnel position.
 * 
 * This is the SINGLE SOURCE OF TRUTH — do NOT duplicate this logic elsewhere.
 */

import { classifyProduct } from '@/hooks/useCustomerJourney';

export type FunnelPosition = 'principal' | 'bump1' | 'upsell1' | 'other';

export interface FunnelProductConfig {
  label: string;
  position: FunnelPosition;
  badgeLabel: string;
}

export const FUNNEL_PRODUCTS: Record<Exclude<FunnelPosition, 'other'>, FunnelProductConfig> = {
  principal: { label: 'Guia de Tinturas', position: 'principal', badgeLabel: 'Principal' },
  bump1:     { label: 'Guia dos Chás Originais', position: 'bump1', badgeLabel: 'Bump' },
  upsell1:   { label: 'Curso Mestre das Tinturas', position: 'upsell1', badgeLabel: 'Upsell' },
};

/**
 * Maps a product key from classifyProduct() to a funnel position.
 */
const PRODUCT_KEY_TO_FUNNEL: Record<string, FunnelPosition> = {
  guia_tinturas: 'principal',
  guia_chas: 'bump1',
  mestre_tinturas: 'upsell1',
};

/**
 * Classify a transaction into its funnel position.
 * 
 * 1. First tries classifyProduct() with rich pattern catalog (16+ products)
 * 2. Falls back to offer_name patterns for edge cases
 */
export function classifyTransaction(
  tx: { product_name?: string | null; offer_name?: string | null }
): FunnelPosition {
  // Step 1: Use the rich product catalog
  const product = classifyProduct(tx.product_name || '');
  if (product) {
    const mapped = PRODUCT_KEY_TO_FUNNEL[product.key];
    if (mapped) return mapped;
    // Known product but not a funnel position (e.g. curso_erveiros, supervita)
    return 'other';
  }

  // Step 2: Fallback to offer_name patterns for unclassified product names
  const on = (tx.offer_name || '').toLowerCase();
  if (on.includes('oferta 197')) return 'upsell1';
  if (on.includes('checkout principal')) return 'principal';
  if (on.includes('bump')) return 'bump1';

  return 'other';
}

/**
 * Compute average unit price from actual revenue and count.
 */
export function avgUnitPrice(revenue: number, count: number): number {
  return count > 0 ? revenue / count : 0;
}
