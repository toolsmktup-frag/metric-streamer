import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { Lead, LeadStagePosition } from '@/types/leadFunnels';

export interface PurchaseSummary {
  totalSpent: number;
  totalOrders: number;
}

const PAGE_SIZE = 1000;

async function fetchAllIn<T>(
  table: string,
  select: string,
  column: string,
  values: string[],
): Promise<T[]> {
  if (values.length === 0) return [];

  const rows: T[] = [];
  // Supabase .in() has a limit, batch in chunks of 300
  const CHUNK = 300;
  for (let i = 0; i < values.length; i += CHUNK) {
    const chunk = values.slice(i, i + CHUNK);
    let from = 0;
    while (true) {
      const { data, error } = await (supabase as any)
        .from(table)
        .select(select)
        .in(column, chunk)
        .range(from, from + PAGE_SIZE - 1);
      if (error) {
        console.warn(`[useBulkLeadPurchases] query error on ${table}:`, error.message);
        break;
      }
      const batch = (data || []) as T[];
      rows.push(...batch);
      if (batch.length < PAGE_SIZE) break;
      from += PAGE_SIZE;
    }
  }
  return rows;
}

interface UnifiedCustomer {
  id: string;
  primary_email: string | null;
  primary_phone: string | null;
}

interface CustomerPurchase {
  unified_customer_id: string;
  net_amount: number | null;
  gross_amount: number;
  status: string;
}

export function useBulkLeadPurchases(
  positions: (LeadStagePosition & { lead: Lead })[] | undefined,
) {
  // Extract unique emails and phones
  const { emails, phones, leadKeyMap } = useMemo(() => {
    const emailSet = new Set<string>();
    const phoneSet = new Set<string>();
    // Map email/phone → lead ids
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

  const stableKey = useMemo(
    () => `${emails.length}-${phones.length}`,
    [emails.length, phones.length],
  );

  return useQuery({
    queryKey: ['bulk-lead-purchases', stableKey],
    queryFn: async (): Promise<Map<string, PurchaseSummary>> => {
      // 1. Find unified_customers by email or phone
      const [byEmail, byPhone] = await Promise.all([
        fetchAllIn<UnifiedCustomer>('unified_customers', 'id, primary_email, primary_phone', 'primary_email', emails),
        fetchAllIn<UnifiedCustomer>('unified_customers', 'id, primary_email, primary_phone', 'primary_phone', phones),
      ]);

      // Merge and dedupe customers
      const customerMap = new Map<string, UnifiedCustomer>();
      [...byEmail, ...byPhone].forEach((c) => customerMap.set(c.id, c));

      // Map customer_id → lead_ids
      const customerToLeads = new Map<string, Set<string>>();
      customerMap.forEach((customer) => {
        const leadIds = new Set<string>();
        if (customer.primary_email) {
          const key = `e:${customer.primary_email.toLowerCase().trim()}`;
          leadKeyMap.get(key)?.forEach((id) => leadIds.add(id));
        }
        if (customer.primary_phone) {
          const key = `p:${customer.primary_phone.trim()}`;
          leadKeyMap.get(key)?.forEach((id) => leadIds.add(id));
        }
        customerToLeads.set(customer.id, leadIds);
      });

      // 2. Fetch purchases for all customers
      const customerIds = Array.from(customerMap.keys());
      const purchases = await fetchAllIn<CustomerPurchase>(
        'customer_purchases',
        'unified_customer_id, net_amount, gross_amount, status',
        'unified_customer_id',
        customerIds,
      );

      // 3. Aggregate per lead
      const result = new Map<string, PurchaseSummary>();

      purchases.forEach((p) => {
        const isApproved = p.status === 'approved' || p.status === 'Aprovada';
        if (!isApproved) return;

        const amount = p.net_amount ?? p.gross_amount;
        const leadIds = customerToLeads.get(p.unified_customer_id);
        leadIds?.forEach((leadId) => {
          const existing = result.get(leadId) || { totalSpent: 0, totalOrders: 0 };
          existing.totalSpent += amount;
          existing.totalOrders += 1;
          result.set(leadId, existing);
        });
      });

      return result;
    },
    enabled: emails.length > 0 || phones.length > 0,
    staleTime: 5 * 60 * 1000,
  });
}
