import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { Lead, LeadStagePosition } from '@/types/leadFunnels';

export interface LeadPurchaseInfo {
  productNames: string[];
  lastPurchaseDate: string;
  purchases: Array<{ productName: string; date: string; quantity?: number; quantitySource?: string }>;
}

/**
 * Builds a Map<leadId, LeadPurchaseInfo> with the REAL purchases of each lead,
 * sourced from `customer_purchases` (via `unified_customers` matched by email/phone) —
 * NOT from `lead_events`, which can be out of order or include stale/foreign events.
 *
 * Each entry contains the list of authorized purchases with their actual `purchased_at`
 * timestamp, so `useRecontactDeadlines` can compute deadlines per matched product and
 * pick the most recent one.
 */
export function useBulkLeadPurchaseProducts(
  _funnelId: string | null | undefined,
  positions: (LeadStagePosition & { lead: Lead })[] | undefined,
) {
  const { emailToLeads, phoneToLeads, emails, phones, leadIdsKey } = useMemo(() => {
    const e2l = new Map<string, Set<string>>();
    const p2l = new Map<string, Set<string>>();
    const ids: string[] = [];

    const addPhoneVariants = (raw: string, leadId: string) => {
      const digits = raw.replace(/\D/g, '');
      const variants = new Set<string>([raw, digits, `+${digits}`]);
      if (digits.startsWith('55') && digits.length >= 12) {
        variants.add(digits.slice(2));
      } else if (digits.length >= 10 && digits.length <= 11) {
        variants.add(`55${digits}`);
        variants.add(`+55${digits}`);
      }
      for (const v of variants) {
        if (!v) continue;
        const s = p2l.get(v) || new Set<string>();
        s.add(leadId);
        p2l.set(v, s);
      }
    };

    for (const pos of positions || []) {
      ids.push(pos.lead_id);
      const email = pos.lead.email?.toLowerCase().trim();
      const phone = pos.lead.phone?.trim();
      if (email && email.includes('@')) {
        const s = e2l.get(email) || new Set<string>();
        s.add(pos.lead_id);
        e2l.set(email, s);
      }
      if (phone) addPhoneVariants(phone, pos.lead_id);
    }

    return {
      emailToLeads: e2l,
      phoneToLeads: p2l,
      emails: Array.from(e2l.keys()),
      phones: Array.from(p2l.keys()),
      leadIdsKey: ids.sort().join(','),
    };
  }, [positions]);

  const stableKey = useMemo(() => {
    let h = 0;
    const str = `${emails.length}|${phones.length}|${leadIdsKey}`;
    for (let i = 0; i < str.length; i++) {
      h = ((h << 5) - h + str.charCodeAt(i)) | 0;
    }
    return `${emails.length}-${phones.length}-${h}`;
  }, [emails, phones, leadIdsKey]);

  return useQuery({
    queryKey: ['bulk-lead-purchase-products-v2', stableKey],
    queryFn: async (): Promise<Map<string, LeadPurchaseInfo>> => {
      const result = new Map<string, LeadPurchaseInfo>();
      if (emails.length === 0 && phones.length === 0) return result;

      // 1) Resolve unified_customers by email/phone in batches
      const BATCH = 400;
      const customerIdToLeadIds = new Map<string, Set<string>>();

      const collectCustomers = async (column: 'primary_email' | 'primary_phone', values: string[], lookup: Map<string, Set<string>>) => {
        for (let i = 0; i < values.length; i += BATCH) {
          const chunk = values.slice(i, i + BATCH);
          const { data, error } = await (supabase as any)
            .from('unified_customers')
            .select(`id, ${column}`)
            .in(column, chunk)
            .limit(100000);
          if (error) {
            console.error('[useBulkLeadPurchaseProducts] unified_customers error:', error.message);
            continue;
          }
          for (const row of data || []) {
            const key = (row[column] as string | null)?.toString();
            if (!key) continue;
            const normalizedKey = column === 'primary_email' ? key.toLowerCase().trim() : key.trim();
            const leadIds = lookup.get(normalizedKey);
            if (!leadIds) continue;
            const s = customerIdToLeadIds.get(row.id) || new Set<string>();
            for (const lid of leadIds) s.add(lid);
            customerIdToLeadIds.set(row.id, s);
          }
        }
      };

      await collectCustomers('primary_email', emails, emailToLeads);
      await collectCustomers('primary_phone', phones, phoneToLeads);

      if (customerIdToLeadIds.size === 0) return result;

      // 2) Fetch purchases for resolved customers in batches
      const customerIds = Array.from(customerIdToLeadIds.keys());
      const purchasesByLead = new Map<string, Array<{ productName: string; date: string; quantity?: number; quantitySource?: string }>>();

      for (let i = 0; i < customerIds.length; i += BATCH) {
        const chunk = customerIds.slice(i, i + BATCH);
        const { data, error } = await (supabase as any)
          .from('customer_purchases')
          .select('unified_customer_id, product_name, purchased_at, status, quantity, quantity_source')
          .in('unified_customer_id', chunk)
          .eq('status', 'authorized')
          .order('purchased_at', { ascending: false })
          .limit(100000);
        if (error) {
          console.error('[useBulkLeadPurchaseProducts] customer_purchases error:', error.message);
          continue;
        }
        for (const row of data || []) {
          const productName = (row.product_name as string | null)?.trim();
          const date = row.purchased_at as string | null;
          if (!productName || !date) continue;
          const leadIds = customerIdToLeadIds.get(row.unified_customer_id);
          if (!leadIds) continue;
          const quantity = typeof row.quantity === 'number' ? row.quantity : undefined;
          const quantitySource = (row.quantity_source as string | null) ?? undefined;
          for (const lid of leadIds) {
            const arr = purchasesByLead.get(lid) || [];
            arr.push({ productName, date, quantity, quantitySource });
            purchasesByLead.set(lid, arr);
          }
        }
      }

      // 3) Build LeadPurchaseInfo per lead
      for (const [leadId, purchases] of purchasesByLead) {
        // Sort desc by date
        purchases.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
        const productNames = Array.from(new Set(purchases.map(p => p.productName)));
        result.set(leadId, {
          productNames,
          lastPurchaseDate: purchases[0]?.date ?? '',
          purchases,
        });
      }

      // 4) Fallback: include leads with metadata.product_name even without customer match
      for (const pos of positions || []) {
        if (result.has(pos.lead_id)) continue;
        const metaName = (pos.lead.metadata?.product_name as string | undefined)?.trim();
        if (!metaName) continue;
        const metaDate =
          (pos.lead.metadata?.purchased_at as string | undefined) ||
          (pos.lead.metadata?.transaction_purchased_at as string | undefined) ||
          '';
        result.set(pos.lead_id, {
          productNames: [metaName],
          lastPurchaseDate: metaDate,
          purchases: metaDate ? [{ productName: metaName, date: metaDate }] : [],
        });
      }

      console.log(`[useBulkLeadPurchaseProducts v2] ${result.size} leads resolved via customer_purchases`);
      return result;
    },
    enabled: (emails.length > 0 || phones.length > 0),
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
    structuralSharing: false,
  });
}
