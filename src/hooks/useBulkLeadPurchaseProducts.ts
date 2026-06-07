import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { Lead, LeadStagePosition } from '@/types/leadFunnels';

export interface LeadPurchaseInfo {
  productNames: string[];
  lastPurchaseDate: string;
  purchases: Array<{ productName: string; date: string }>;
}

/**
 * Fetches all purchase-related events for leads in a funnel,
 * returning a Map<leadId, LeadPurchaseInfo> with ALL products each lead purchased
 * and the date of their MOST RECENT purchase.
 * Used by useRecontactDeadlines to sum recontact_days across products.
 */
export function useBulkLeadPurchaseProducts(
  funnelId: string | null | undefined,
  positions: (LeadStagePosition & { lead: Lead })[] | undefined,
) {
  const leadIds = useMemo(
    () => (positions || []).map(p => p.lead_id),
    [positions],
  );

  const leadMetadataProducts = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const p of positions || []) {
      const productName = p.lead.metadata?.product_name;
      if (typeof productName === 'string' && productName.trim()) {
        map.set(p.lead_id, [productName.trim()]);
      }
    }
    return map;
  }, [positions]);

  const stableKey = useMemo(() => {
    if (!leadIds.length) return 'empty';
    let h = 0;
    const str = leadIds.sort().join(',');
    for (let i = 0; i < str.length; i++) {
      h = ((h << 5) - h + str.charCodeAt(i)) | 0;
    }
    return `${leadIds.length}-${h}`;
  }, [leadIds]);

  return useQuery({
    queryKey: ['bulk-lead-purchase-products', funnelId, stableKey],
    queryFn: async (): Promise<Map<string, LeadPurchaseInfo>> => {
      const result = new Map<string, LeadPurchaseInfo>();
      if (!funnelId || leadIds.length === 0) return result;

      // Fetch purchase events from lead_events in batches.
      // Do not filter by funnel_id here: purchase events can be attributed to another funnel,
      // while the Kanban column must filter by products purchased by the leads currently in it.
      const BATCH = 500;
      const purchaseEventNames = ['purchase', 'Purchase', 'pago', 'authorized', 'autorizado'];

      for (let i = 0; i < leadIds.length; i += BATCH) {
        const batch = leadIds.slice(i, i + BATCH);
        const { data, error } = await (supabase as any)
          .from('lead_events')
          .select('lead_id, metadata, created_at')
          .in('lead_id', batch)
          .in('event_name', purchaseEventNames)
          .order('created_at', { ascending: false })
          .limit(100000);

        if (error) {
          console.error('[useBulkLeadPurchaseProducts] error:', error.message);
          continue;
        }

        for (const row of data || []) {
          const productName = row.metadata?.product_name as string;
          const existing = result.get(row.lead_id);
          if (!existing) {
            // First row for this lead (most recent due to ordering)
            result.set(row.lead_id, {
              productNames: productName ? [productName] : [],
              lastPurchaseDate: row.created_at,
            });
          } else {
            // Add product name if not duplicate
            if (productName && !existing.productNames.includes(productName)) {
              existing.productNames.push(productName);
            }
            // lastPurchaseDate is already set from first (most recent) row
          }
        }
      }

      for (const [leadId, productNames] of leadMetadataProducts) {
        const existing = result.get(leadId);
        if (!existing) {
          result.set(leadId, { productNames, lastPurchaseDate: '' });
          continue;
        }
        for (const productName of productNames) {
          if (!existing.productNames.includes(productName)) {
            existing.productNames.push(productName);
          }
        }
      }

      console.log(`[useBulkLeadPurchaseProducts] ${result.size} leads with products`);
      return result;
    },
    enabled: !!funnelId && leadIds.length > 0,
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
    structuralSharing: false,
  });
}
