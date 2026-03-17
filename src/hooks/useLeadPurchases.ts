import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface LeadPurchase {
  id: string;
  product_name: string;
  gross_amount: number;
  net_amount: number | null;
  status: string;
  purchased_at: string;
  platform: string;
  product_type: string | null;
  offer_name: string | null;
  payment_method: string | null;
  installments: number | null;
}

export interface LeadPurchaseSummary {
  purchases: LeadPurchase[];
  totalSpent: number;
  totalOrders: number;
  products: string[];
}

export function useLeadPurchases(email: string | null, phone: string | null) {
  return useQuery({
    queryKey: ['lead-purchases', email, phone],
    queryFn: async (): Promise<LeadPurchaseSummary> => {
      // Find unified_customer by email or phone
      let customerId: string | null = null;

      if (email) {
        const { data } = await supabase
          .from('unified_customers')
          .select('id')
          .eq('primary_email', email)
          .maybeSingle();
        customerId = data?.id ?? null;
      }

      if (!customerId && phone) {
        const { data } = await supabase
          .from('unified_customers')
          .select('id')
          .eq('primary_phone', phone)
          .maybeSingle();
        customerId = data?.id ?? null;
      }

      if (!customerId) {
        return { purchases: [], totalSpent: 0, totalOrders: 0, products: [] };
      }

      const { data: purchases, error } = await supabase
        .from('customer_purchases')
        .select('id, product_name, gross_amount, net_amount, status, purchased_at, platform, product_type, offer_name, payment_method, installments')
        .eq('unified_customer_id', customerId)
        .order('purchased_at', { ascending: false });

      if (error) throw error;

      const list = (purchases || []) as LeadPurchase[];
      const approvedPurchases = list.filter(p => p.status === 'approved' || p.status === 'Aprovada');
      const totalSpent = approvedPurchases.reduce((sum, p) => sum + (p.net_amount ?? p.gross_amount), 0);
      const products = [...new Set(list.map(p => p.product_name))];

      return {
        purchases: list,
        totalSpent,
        totalOrders: approvedPurchases.length,
        products,
      };
    },
    enabled: !!(email || phone),
    staleTime: 5 * 60 * 1000,
  });
}

export function useLeadFunnelJourney(leadId: string | null) {
  return useQuery({
    queryKey: ['lead-funnel-journey', leadId],
    queryFn: async () => {
      if (!leadId) return [];
      const { data, error } = await (supabase as any)
        .from('lead_stage_positions')
        .select('*, stage:lead_funnel_stages(name, color), funnel:lead_funnels(name, color)')
        .eq('lead_id', leadId);
      if (error) throw error;
      return data || [];
    },
    enabled: !!leadId,
  });
}
