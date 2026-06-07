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

      // Build list of {productName, date} pairs to evaluate.
      // Priority: per-purchase events (with their own dates) > metadata.product_name + fallback date.
      const fallbackDate =
        (lead.metadata?.purchased_at as string) ||
        purchaseMap?.get(pos.lead_id)?.firstPurchaseDate ||
        purchaseInfo?.lastPurchaseDate ||
        '';

      let purchasesToCheck: Array<{ productName: string; date: string }> = [];
      if (purchaseInfo?.purchases && purchaseInfo.purchases.length > 0) {
        purchasesToCheck = purchaseInfo.purchases;
      } else {
        const metadataProductName = (lead.metadata?.product_name as string) || '';
        if (metadataProductName) {
          purchasesToCheck = [{ productName: metadataProductName, date: fallbackDate }];
        }
      }

      if (purchasesToCheck.length === 0) continue;

      // For each purchase that matches a configured recontact product,
      // compute its own deadline = purchaseDate + recontact_days.
      // Pick the FURTHEST deadline (max) — that becomes the card's countdown.
      let bestDeadline: Date | null = null;
      let bestProduct: RecontactProduct | undefined;

      for (const p of purchasesToCheck) {
        const matched = matchProduct(p.productName);
        if (!matched) continue;

        const dateRaw = p.date || fallbackDate;
        const purchaseDate = parseLocalDateTime(dateRaw);
        if (!purchaseDate) continue;

        const deadline = addDays(purchaseDate, matched.recontact_days!);
        if (!bestDeadline || deadline > bestDeadline) {
          bestDeadline = deadline;
          bestProduct = matched;
        }
      }

      if (!bestDeadline || !bestProduct) {
        console.debug(`[recontact] lead=${pos.lead_id}: no matched purchase with valid date`);
        continue;
      }

      const daysRemaining = differenceInDays(bestDeadline, today);
      const displayName = bestProduct.display_name || bestProduct.product_name_contains;

      if (import.meta.env.DEV) {
        console.debug(
          `[recontact] lead=${pos.lead_id} email=${pos.lead.email} → ${displayName} ` +
          `deadline=${bestDeadline.toISOString().slice(0, 10)} (${daysRemaining}d) ` +
          `cycle=${bestProduct.recontact_days}d`,
        );
      }

      map.set(pos.lead_id, {
        daysRemaining,
        isOverdue: daysRemaining < 0,
        deadlineDate: bestDeadline,
        productName: displayName,
        recontactDays: bestProduct.recontact_days!,
        matchedProductId: bestProduct.id,
      });
    }

    return map;
  }, [positions, products, mappings, purchaseMap, leadPurchaseInfoMap]);
}
