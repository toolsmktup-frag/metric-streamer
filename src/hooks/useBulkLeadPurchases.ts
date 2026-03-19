import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { Lead, LeadStagePosition } from '@/types/leadFunnels';

export interface PurchaseSummary {
  totalSpent: number;
  totalOrders: number;
  firstPurchaseDate: string | null;
}

export function useBulkLeadPurchases(
  positions: (LeadStagePosition & { lead: Lead })[] | undefined,
) {
  const { emails, phones, leadKeyMap } = useMemo(() => {
    const emailSet = new Set<string>();
    const phoneSet = new Set<string>();
    const keyMap = new Map<string, Set<string>>();

    (positions || []).forEach((p) => {
      const email = p.lead.email?.toLowerCase().trim();
      const phone = p.lead.phone?.trim();
      if (email && email.includes('@')) {
        emailSet.add(email);
        const set = keyMap.get(`e:${email}`) || new Set();
        set.add(p.lead_id);
        keyMap.set(`e:${email}`, set);
      }
      if (phone) {
        phoneSet.add(phone);
        const set = keyMap.get(`p:${phone}`) || new Set();
        set.add(p.lead_id);
        keyMap.set(`p:${phone}`, set);
      }
    });

    return {
      emails: Array.from(emailSet),
      phones: Array.from(phoneSet),
      leadKeyMap: keyMap,
    };
  }, [positions]);

  const stableKey = useMemo(() => {
    const sorted = [...emails, '|', ...phones].sort();
    let h = 0;
    const str = sorted.join(',');
    for (let i = 0; i < str.length; i++) {
      h = ((h << 5) - h + str.charCodeAt(i)) | 0;
    }
    return `${emails.length}-${phones.length}-${h}`;
  }, [emails, phones]);

  return useQuery({
    queryKey: ['bulk-lead-purchases', stableKey],
    queryFn: async (): Promise<Map<string, PurchaseSummary>> => {
      console.log(`[useBulkLeadPurchases] RPC call: ${emails.length} emails, ${phones.length} phones`);

      const { data: rpcData, error } = await (supabase as any).rpc('get_bulk_purchase_summaries', {
        p_emails: emails,
        p_phones: phones,
      }).limit(100000);

      if (error) {
        console.error('[useBulkLeadPurchases] RPC error:', error.message);
        throw error;
      }

      const result = new Map<string, PurchaseSummary>();

      (rpcData || []).forEach((row: { match_type: string; match_value: string; total_spent: number; total_orders: number; first_purchase_date: string | null }) => {
        const prefix = row.match_type === 'email' ? 'e:' : 'p:';
        const key = prefix + (row.match_type === 'email' ? row.match_value.toLowerCase().trim() : row.match_value.trim());
        const leadIds = leadKeyMap.get(key);

        leadIds?.forEach((leadId) => {
          const existing = result.get(leadId);
          if (existing) {
            existing.totalSpent += Number(row.total_spent);
            existing.totalOrders += row.total_orders;
            if (row.first_purchase_date && (!existing.firstPurchaseDate || row.first_purchase_date < existing.firstPurchaseDate)) {
              existing.firstPurchaseDate = row.first_purchase_date;
            }
          } else {
            result.set(leadId, {
              totalSpent: Number(row.total_spent),
              totalOrders: row.total_orders,
              firstPurchaseDate: row.first_purchase_date,
            });
          }
        });
      });

      console.log(`[useBulkLeadPurchases] Done: ${rpcData?.length || 0} rows, ${result.size} leads with LTV`);
      return result;
    },
    enabled: emails.length > 0 || phones.length > 0,
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
    structuralSharing: false,
  });
}
