import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

// Vínculo campanha → funil. O auto-assign erra quando a conta de anúncios é
// compartilhada entre funis (ex: Articulabem/Clube Secreto/RevitaSoul). Aqui o
// usuário corrige na mão; a RPC set_campaign_funnel propaga p/ adsets e ads.

export interface MetaCampaign {
  id: string;
  name: string;
  account_id: string | null;
  funnel_id: string | null;
  funnel_name?: string;
  status: string | null;
}

export function useMetaCampaigns() {
  return useQuery({
    queryKey: ['meta-campaigns-funnel'],
    queryFn: async () => {
      const rows: MetaCampaign[] = [];
      const pageSize = 1000;
      for (let from = 0; ; from += pageSize) {
        const { data, error } = await (supabase as any)
          .from('meta_campaigns')
          .select('id, name, account_id, funnel_id, status, funnels(name)')
          .order('name')
          .range(from, from + pageSize - 1);
        if (error) throw error;
        const batch = (data || []).map((r: any) => ({ ...r, funnel_name: r.funnels?.name }));
        rows.push(...batch);
        if (batch.length < pageSize) break;
      }
      return rows;
    },
    staleTime: 30_000,
  });
}

export function useSetCampaignFunnel() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (p: { campaignId: string; funnelId: string | null }) => {
      const { error } = await (supabase as any).rpc('set_campaign_funnel', {
        p_campaign_id: p.campaignId,
        p_funnel_id: p.funnelId,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['meta-campaigns-funnel'] });
      qc.invalidateQueries({ queryKey: ['kpi-meta-insights'] });
      qc.invalidateQueries({ queryKey: ['all-sales'] });
    },
  });
}
