import { useMemo } from 'react';
import { differenceInDays, addDays } from 'date-fns';
import { parseLocalDateTime } from '@/lib/localDate';
import type { Lead, LeadStagePosition } from '@/types/leadFunnels';
import type { LeadProductMapping } from '@/hooks/useLeadProductMappings';
import type { PurchaseSummary } from '@/hooks/useBulkLeadPurchases';

export interface RecontactProduct {
  id?: string;
  product_name_contains: string;
  display_name?: string | null;
  recontact_days: number | null;
}

export interface RecontactInfo {
  daysRemaining: number;
  isOverdue: boolean;
  deadlineDate: Date;
  productName: string;
  recontactDays: number;
  matchedProductId?: string;
}

/**
 * For each lead, match their product (from metadata) against configured products
 * with recontact_days, then calculate countdown.
 *
 * Priority:
 * 1. Explicit mapping (lead_product_mappings table)
 * 2. Substring match (product_name_contains) as fallback
 *
 * Date source priority:
 * 1. metadata.purchased_at (parsed with BR date support)
 * 2. purchaseMap.firstPurchaseDate (from customer_purchases table)
 */
export function useRecontactDeadlines(
  positions: (LeadStagePosition & { lead: Lead })[],
  products: RecontactProduct[] | undefined,
  mappings?: LeadProductMapping[],
  purchaseMap?: Map<string, PurchaseSummary>,
): Map<string, RecontactInfo> {
  return useMemo(() => {
    const map = new Map<string, RecontactInfo>();

    const productsWithRecontact = (products || []).filter(
      fp => fp.recontact_days != null && fp.recontact_days > 0,
    );

    if (productsWithRecontact.length === 0) return map;

    // Build mapping lookup: raw_product_name -> lead_funnel_product_id
    const mappingLookup = new Map<string, string>();
    for (const m of mappings || []) {
      mappingLookup.set(m.raw_product_name, m.lead_funnel_product_id);
    }

    // Build product lookup by id
    const productById = new Map<string, RecontactProduct>();
    for (const p of productsWithRecontact) {
      if (p.id) productById.set(p.id, p);
    }

    const today = new Date();

    for (const pos of positions) {
      const lead = pos.lead;
      const productName = (lead.metadata?.product_name as string) || '';

      if (!productName) continue;

      // Resolve purchase date: metadata first, then purchaseMap fallback
      let purchasedAtRaw = (lead.metadata?.purchased_at as string) || '';
      if (!purchasedAtRaw && purchaseMap) {
        const summary = purchaseMap.get(pos.lead_id);
        if (summary?.firstPurchaseDate) {
          purchasedAtRaw = summary.firstPurchaseDate; // ISO format from DB
        }
      }

      if (!purchasedAtRaw) continue;

      // 1. Try explicit mapping first
      let matchedProduct: RecontactProduct | undefined;
      const mappedProductId = mappingLookup.get(productName);
      if (mappedProductId) {
        matchedProduct = productById.get(mappedProductId);
      }

      // 2. Fallback to substring match
      if (!matchedProduct) {
        matchedProduct = productsWithRecontact.find(fp =>
          productName.toLowerCase().includes(fp.product_name_contains.toLowerCase()),
        );
      }

      if (!matchedProduct) continue;

      // Use parseLocalDateTime to correctly handle BR date format (dd/MM/yyyy)
      const purchaseDate = parseLocalDateTime(purchasedAtRaw);
      if (!purchaseDate) continue;

      const deadlineDate = addDays(purchaseDate, matchedProduct.recontact_days!);
      const daysRemaining = differenceInDays(deadlineDate, today);

      map.set(pos.lead_id, {
        daysRemaining,
        isOverdue: daysRemaining < 0,
        deadlineDate,
        productName: matchedProduct.display_name || matchedProduct.product_name_contains,
        recontactDays: matchedProduct.recontact_days!,
        matchedProductId: matchedProduct.id,
      });
    }

    return map;
  }, [positions, products, mappings, purchaseMap]);
}
