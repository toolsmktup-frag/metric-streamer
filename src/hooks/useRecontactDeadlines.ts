import { useMemo } from 'react';
import { differenceInDays, addDays } from 'date-fns';
import { parseLocalDateTime } from '@/lib/localDate';
import type { Lead, LeadStagePosition } from '@/types/leadFunnels';
import type { LeadProductMapping } from '@/hooks/useLeadProductMappings';
import type { PurchaseSummary } from '@/hooks/useBulkLeadPurchases';
import type { LeadPurchaseInfo } from '@/hooks/useBulkLeadPurchaseProducts';

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
 * For each lead, match their purchased products against configured products
 * with recontact_days, then calculate countdown.
 *
 * SOMA LINEAR: When a lead has multiple purchases in the same funnel,
 * the recontact_days are SUMMED and counted from the MOST RECENT purchase date.
 * Ex: Product A (90d) + Product B (180d) = 270 days from last purchase.
 *
 * Priority for product matching:
 * 1. Explicit mapping (lead_product_mappings table)
 * 2. Substring match (product_name_contains) as fallback
 *
 * Date source priority:
 * 1. lastPurchaseDate from bulk purchase events (most recent event)
 * 2. metadata.purchased_at (parsed with BR date support)
 * 3. purchaseMap.firstPurchaseDate (from customer_purchases table)
 */
export function useRecontactDeadlines(
  positions: (LeadStagePosition & { lead: Lead })[],
  products: RecontactProduct[] | undefined,
  mappings?: LeadProductMapping[],
  purchaseMap?: Map<string, PurchaseSummary>,
  leadPurchaseInfoMap?: Map<string, LeadPurchaseInfo>,
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

    // Helper: match a product name against configured products
    const matchProduct = (productName: string): RecontactProduct | undefined => {
      // 1. Explicit mapping first
      const mappedId = mappingLookup.get(productName);
      if (mappedId) {
        const found = productById.get(mappedId);
        if (found) return found;
      }
      // 2. Substring match
      return productsWithRecontact.find(fp =>
        productName.toLowerCase().includes(fp.product_name_contains.toLowerCase()),
      );
    };

    for (const pos of positions) {
      const lead = pos.lead;
      const purchaseInfo = leadPurchaseInfoMap?.get(pos.lead_id);

      // Get ALL product names this lead has purchased
      const allProductNames = purchaseInfo?.productNames || [];
      const metadataProductName = (lead.metadata?.product_name as string) || '';
      
      // If we have bulk product names, use those; otherwise fallback to metadata
      const productNamesToCheck = allProductNames.length > 0
        ? allProductNames
        : metadataProductName ? [metadataProductName] : [];

      // Resolve purchase date — priority: lastPurchaseDate > metadata > purchaseMap
      let purchasedAtRaw = purchaseInfo?.lastPurchaseDate || '';
      if (!purchasedAtRaw) {
        purchasedAtRaw = (lead.metadata?.purchased_at as string) || '';
      }
      if (!purchasedAtRaw && purchaseMap) {
        const summary = purchaseMap.get(pos.lead_id);
        if (summary?.firstPurchaseDate) {
          purchasedAtRaw = summary.firstPurchaseDate;
        }
      }

      // No products found → skip
      if (productNamesToCheck.length === 0) {
        console.debug(`[recontact] lead=${pos.lead_id}: no products found, skipping`);
        continue;
      }

      if (!purchasedAtRaw) continue;

      const purchaseDate = parseLocalDateTime(purchasedAtRaw);
      if (!purchaseDate) continue;

      // Match ALL products and SUM recontact_days
      let totalRecontactDays = 0;
      let lastMatchedProduct: RecontactProduct | undefined;
      const matchedProductNames: string[] = [];

      for (const pName of productNamesToCheck) {
        const matched = matchProduct(pName);
        if (matched) {
          totalRecontactDays += matched.recontact_days!;
          lastMatchedProduct = matched;
          matchedProductNames.push(matched.display_name || matched.product_name_contains);
        }
      }

      console.debug(
        `[recontact] lead=${pos.lead_id}: products=${productNamesToCheck.length}, matched=${matchedProductNames.length}, totalDays=${totalRecontactDays}`,
        { productNamesToCheck, matchedProductNames }
      );

      if (!lastMatchedProduct || totalRecontactDays === 0) continue;

      const deadlineDate = addDays(purchaseDate, totalRecontactDays);
      const daysRemaining = differenceInDays(deadlineDate, today);

      // Display name: if multiple products, show combined
      const displayName = matchedProductNames.length > 1
        ? matchedProductNames.join(' + ')
        : matchedProductNames[0];

      map.set(pos.lead_id, {
        daysRemaining,
        isOverdue: daysRemaining < 0,
        deadlineDate,
        productName: displayName,
        recontactDays: totalRecontactDays,
        matchedProductId: lastMatchedProduct.id,
      });
    }

    return map;
  }, [positions, products, mappings, purchaseMap, leadPurchaseInfoMap]);
}
