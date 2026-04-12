import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { Lead, LeadStagePosition } from '@/types/leadFunnels';

/**
 * Fetches all purchase-related events for leads in a funnel,
 * returning a Map<leadId, product_name[]> with ALL products each lead purchased.
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
    queryFn: async (): Promise<Map<string, string[]>> => {
      const result = new Map<string, string[]>();
      if (!funnelId || leadIds.length === 0) return result;

      // Fetch purchase events from lead_events in batches
      const BATCH = 500;
      const purchaseEventNames = ['purchase', 'Purchase', 'pago', 'authorized'];

      for (let i = 0; i < leadIds.length; i += BATCH) {
        const batch = leadIds.slice(i, i + BATCH);
        const { data, error } = await (supabase as any)
          .from('lead_events')
          .select('lead_id, metadata')
          .in('lead_id', batch)
          .in('event_name', purchaseEventNames)
          .limit(100000);

        if (error) {
          console.error('[useBulkLeadPurchaseProducts] error:', error.message);
          continue;
        }

        for (const row of data || []) {
          const productName = row.metadata?.product_name as string;
          if (!productName) continue;
          const arr = result.get(row.lead_id) || [];
          // Avoid duplicate product names
          if (!arr.includes(productName)) {
            arr.push(productName);
          }
          result.set(row.lead_id, arr);
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
