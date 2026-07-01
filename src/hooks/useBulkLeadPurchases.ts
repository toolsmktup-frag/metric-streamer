import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { Lead, LeadStagePosition } from '@/types/leadFunnels';
import { brPhoneForms } from '@/lib/phone';

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
        // Manda TODAS as formas do número (9º dígito/DDI) pra RPC e mapeia cada
        // uma de volta ao lead — a RPC casa por igualdade exata em
        // customer_identity_links, então o formato precisa bater.
        const forms = brPhoneForms(phone);
        const list = forms.length > 0 ? forms : [phone];
        for (const f of list) {
          phoneSet.add(f);
          const set = keyMap.get(`p:${f}`) || new Set();
          set.add(p.lead_id);
          keyMap.set(`p:${f}`, set);
        }
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

      // Split into batches to avoid Supabase 1000-row RPC limit
      const BATCH_SIZE = 400;
      const allRpcRows: { match_type: string; match_value: string; total_spent: number; total_orders: number; first_purchase_date: string | null }[] = [];

      const emailBatches: string[][] = [];
      for (let i = 0; i < emails.length; i += BATCH_SIZE) {
        emailBatches.push(emails.slice(i, i + BATCH_SIZE));
      }
      const phoneBatches: string[][] = [];
      for (let i = 0; i < phones.length; i += BATCH_SIZE) {
        phoneBatches.push(phones.slice(i, i + BATCH_SIZE));
      }

      // Call RPC for each email batch (with empty phones) + each phone batch (with empty emails)
      // If small enough, do single call
      if (emails.length + phones.length <= BATCH_SIZE) {
        const { data, error } = await (supabase as any).rpc('get_bulk_purchase_summaries', {
          p_emails: emails,
          p_phones: phones,
        }).limit(100000);
        if (error) { console.error('[useBulkLeadPurchases] RPC error:', error.message); throw error; }
        allRpcRows.push(...(data || []));
      } else {
        // Batch emails
        for (const batch of emailBatches) {
          const { data, error } = await (supabase as any).rpc('get_bulk_purchase_summaries', {
            p_emails: batch,
            p_phones: [],
          }).limit(100000);
          if (error) { console.error('[useBulkLeadPurchases] RPC error:', error.message); throw error; }
          allRpcRows.push(...(data || []));
        }
        // Batch phones
        for (const batch of phoneBatches) {
          const { data, error } = await (supabase as any).rpc('get_bulk_purchase_summaries', {
            p_emails: [],
            p_phones: batch,
          }).limit(100000);
          if (error) { console.error('[useBulkLeadPurchases] RPC error:', error.message); throw error; }
          allRpcRows.push(...(data || []));
        }
      }

      const result = new Map<string, PurchaseSummary>();

      allRpcRows.forEach((row) => {
        const prefix = row.match_type === 'email' ? 'e:' : 'p:';
        const key = prefix + (row.match_type === 'email' ? row.match_value.toLowerCase().trim() : row.match_value.trim());
        const leadIds = leadKeyMap.get(key);

        leadIds?.forEach((leadId) => {
          // Skip if lead already resolved (avoid double-counting via email+phone)
          if (!result.has(leadId)) {
            result.set(leadId, {
              totalSpent: Number(row.total_spent),
              totalOrders: row.total_orders,
              firstPurchaseDate: row.first_purchase_date,
            });
          }
        });
      });

      console.log(`[useBulkLeadPurchases] Done: ${allRpcRows.length} rows, ${result.size} leads with LTV`);
      return result;
    },
    enabled: emails.length > 0 || phones.length > 0,
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
    structuralSharing: false,
  });
}
