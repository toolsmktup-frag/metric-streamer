import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface PaginatedLead {
  id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  utm_content: string | null;
  utm_term: string | null;
  created_at: string;
  updated_at: string;
  metadata: Record<string, unknown>;
  positions: {
    id: string;
    lead_id: string;
    funnel_id: string;
    stage_id: string;
    entered_at: string;
    funnel_name: string;
    funnel_color: string;
    stage_name: string;
    stage_color: string;
  }[] | null;
}

interface UsePaginatedLeadsParams {
  search: string;
  funnelId: string | null;
  source: string | null;
  page: number;
  pageSize: number;
}

export function usePaginatedLeads({ search, funnelId, source, page, pageSize }: UsePaginatedLeadsParams) {
  return useQuery({
    queryKey: ['paginated-leads', search, funnelId, source, page, pageSize],
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc('search_leads_paginated', {
        p_search: search || null,
        p_funnel_id: funnelId || null,
        p_source: source || null,
        p_limit: pageSize,
        p_offset: (page - 1) * pageSize,
      });
      if (error) throw error;
      const result = data as { total: number; leads: PaginatedLead[] };
      return {
        leads: (result.leads || []).map(l => ({
          ...l,
          positions: l.positions || [],
        })),
        total: result.total || 0,
        totalPages: Math.ceil((result.total || 0) / pageSize),
      };
    },
    placeholderData: keepPreviousData,
    refetchInterval: 30000,
  });
}

// Fetch funnel and source options (lightweight, for filters)
export function useLeadFilterOptions() {
  return useQuery({
    queryKey: ['lead-filter-options'],
    queryFn: async () => {
      const [funnelsRes, sourcesRes] = await Promise.all([
        (supabase as any).from('lead_funnels').select('id, name').order('name'),
        (supabase as any).from('leads').select('utm_source'),
      ]);

      const funnels = (funnelsRes.data || []) as { id: string; name: string }[];
      const sourceSet = new Set<string>();
      ((sourcesRes.data || []) as { utm_source: string | null }[]).forEach(l => {
        sourceSet.add(l.utm_source || 'Direto');
      });

      return {
        funnels,
        sources: Array.from(sourceSet).sort(),
      };
    },
    staleTime: 60000,
  });
}
