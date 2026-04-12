import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { Lead, LeadStagePosition } from '@/types/leadFunnels';

/**
 * Fetches all purchase-related events for leads in a funnel,
 * returning a Map<leadId, product_name[]> with ALL products each lead purchased.
 * 
 * Sources:
 * 1. lead_events table (purchase events logged by CRM)
 * 2. customer_purchases table (historical purchases, e.g. Eduzz imports)
 * 
 * Used by useRecontactDeadlines to sum recontact_days across products.
 */
export function useBulkLeadPurchaseProducts(
  funnelId: string | null | undefined,
  positions: (LeadStagePosition & { lead: Lead })[] | undefined,
) {
  const { leadIds, emailToLeadIds, phoneToLeadIds } = useMemo(() => {
    const ids: string[] = [];
    const emailMap = new Map<string, Set<string>>();
    const phoneMap = new Map<string, Set<string>>();

    (positions || []).forEach(p => {
      ids.push(p.lead_id);
      const email = p.lead.email?.toLowerCase().trim();
      if (email && email.includes('@')) {
        const set = emailMap.get(email) || new Set();
        set.add(p.lead_id);
        emailMap.set(email, set);
      }
      const phone = p.lead.phone?.trim();
      if (phone) {
        // Store raw + digits-only for flexible matching
        const digits = phone.replace(/\D/g, '');
        for (const variant of [phone, digits]) {
          if (variant) {
            const set = phoneMap.get(variant) || new Set();
            set.add(p.lead_id);
            phoneMap.set(variant, set);
          }
        }
      }
    });

    return { leadIds: ids, emailToLeadIds: emailMap, phoneToLeadIds: phoneMap };
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
    queryFn: async (): Promise<Map<string, string[]>> => {
      const result = new Map<string, string[]>();
      if (!funnelId || leadIds.length === 0) return result;

      // Helper to add product to lead (dedup)
      const addProduct = (leadId: string, productName: string) => {
        const arr = result.get(leadId) || [];
        if (!arr.includes(productName)) {
          arr.push(productName);
        }
        result.set(leadId, arr);
      };

      // === SOURCE 1: lead_events table ===
      const BATCH = 500;
      const purchaseEventNames = ['purchase', 'Purchase', 'pago', 'authorized', 'autorizado'];

      for (let i = 0; i < leadIds.length; i += BATCH) {
        const batch = leadIds.slice(i, i + BATCH);
        const { data, error } = await (supabase as any)
          .from('lead_events')
          .select('lead_id, metadata')
          .in('lead_id', batch)
          .in('event_name', purchaseEventNames)
          .limit(100000);

        if (error) {
          console.error('[useBulkLeadPurchaseProducts] lead_events error:', error.message);
          continue;
        }

        for (const row of data || []) {
          const productName = row.metadata?.product_name as string;
          if (productName) addProduct(row.lead_id, productName);
        }
      }

      // === SOURCE 2: customer_purchases table (via email/phone) ===
      const emails = Array.from(emailToLeadIds.keys());
      const phones = Array.from(phoneToLeadIds.keys());

      if (emails.length > 0 || phones.length > 0) {
        // We need to go through unified_customers to get customer_purchases
        // Batch by emails first
        for (let i = 0; i < emails.length; i += BATCH) {
          const batch = emails.slice(i, i + BATCH);
          const { data: customers, error: custErr } = await supabase
            .from('unified_customers')
            .select('id, primary_email')
            .in('primary_email', batch);

          if (custErr || !customers?.length) continue;

          const customerIds = customers.map(c => c.id);
          const customerEmailMap = new Map(customers.map(c => [c.id, c.primary_email]));

          const { data: purchases, error: purchErr } = await supabase
            .from('customer_purchases')
            .select('unified_customer_id, product_name')
            .in('unified_customer_id', customerIds)
            .eq('status', 'authorized');

          if (purchErr || !purchases?.length) continue;

          for (const p of purchases) {
            if (!p.product_name) continue;
            const email = customerEmailMap.get(p.unified_customer_id)?.toLowerCase().trim();
            if (email) {
              const leadIdSet = emailToLeadIds.get(email);
              leadIdSet?.forEach(leadId => addProduct(leadId, p.product_name));
            }
          }
        }

        // Batch by phones
        if (phones.length > 0) {
          const uniquePhones = [...new Set(phones)];
          for (let i = 0; i < uniquePhones.length; i += BATCH) {
            const batch = uniquePhones.slice(i, i + BATCH);
            const { data: customers, error: custErr } = await supabase
              .from('unified_customers')
              .select('id, primary_phone')
              .in('primary_phone', batch);

            if (custErr || !customers?.length) continue;

            const customerIds = customers.map(c => c.id);
            const customerPhoneMap = new Map(customers.map(c => [c.id, c.primary_phone]));

            const { data: purchases, error: purchErr } = await supabase
              .from('customer_purchases')
              .select('unified_customer_id, product_name')
              .in('unified_customer_id', customerIds)
              .eq('status', 'authorized');

            if (purchErr || !purchases?.length) continue;

            for (const p of purchases) {
              if (!p.product_name) continue;
              const phone = customerPhoneMap.get(p.unified_customer_id);
              if (phone) {
                const leadIdSet = phoneToLeadIds.get(phone) || phoneToLeadIds.get(phone.replace(/\D/g, ''));
                leadIdSet?.forEach(leadId => addProduct(leadId, p.product_name));
              }
            }
          }
        }
      }

      console.log(`[useBulkLeadPurchaseProducts] ${result.size} leads with products (events + purchases)`);
      return result;
    },
    enabled: !!funnelId && leadIds.length > 0,
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
    structuralSharing: false,
  });
}
