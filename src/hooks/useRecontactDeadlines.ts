import { useMemo } from 'react';
import { differenceInDays, addDays } from 'date-fns';
import type { Lead, LeadStagePosition } from '@/types/leadFunnels';

export interface RecontactProduct {
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
}

/**
 * For each lead, match their product (from metadata) against configured products
 * with recontact_days, then calculate countdown.
 */
export function useRecontactDeadlines(
  positions: (LeadStagePosition & { lead: Lead })[],
  products: RecontactProduct[] | undefined,
): Map<string, RecontactInfo> {
  return useMemo(() => {
    const map = new Map<string, RecontactInfo>();

    const productsWithRecontact = (products || []).filter(
      fp => fp.recontact_days != null && fp.recontact_days > 0,
    );

    if (productsWithRecontact.length === 0) return map;

    const today = new Date();

    for (const pos of positions) {
      const lead = pos.lead;
      const productName = (lead.metadata?.product_name as string) || '';
      const purchasedAt = (lead.metadata?.purchased_at as string) || '';

      if (!productName || !purchasedAt) continue;

      const matchedProduct = productsWithRecontact.find(fp =>
        productName.toLowerCase().includes(fp.product_name_contains.toLowerCase()),
      );

      if (!matchedProduct) continue;

      const purchaseDate = new Date(purchasedAt);
      if (isNaN(purchaseDate.getTime())) continue;

      const deadlineDate = addDays(purchaseDate, matchedProduct.recontact_days!);
      const daysRemaining = differenceInDays(deadlineDate, today);

      map.set(pos.lead_id, {
        daysRemaining,
        isOverdue: daysRemaining < 0,
        deadlineDate,
        productName: matchedProduct.display_name || matchedProduct.product_name_contains,
        recontactDays: matchedProduct.recontact_days!,
      });
    }

    return map;
  }, [positions, products]);
}
