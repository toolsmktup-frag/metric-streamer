import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { Lead, LeadStagePosition, LeadFunnel, LeadFunnelStage } from '@/types/leadFunnels';

export interface LeadWithPosition extends Lead {
  positions: (LeadStagePosition & { funnel_name?: string; stage_name?: string; funnel_color?: string; stage_color?: string })[];
}

export function useAllLeads() {
  return useQuery({
    queryKey: ['all-leads'],
    queryFn: async () => {
      const [leadsRes, positionsRes, funnelsRes] = await Promise.all([
        (supabase as any).from('leads').select('*').order('created_at', { ascending: false }),
        (supabase as any).from('lead_stage_positions').select('*'),
        (supabase as any).from('lead_funnels').select('*, lead_funnel_stages(*)'),
      ]);
      if (leadsRes.error) throw leadsRes.error;
      if (positionsRes.error) throw positionsRes.error;
      if (funnelsRes.error) throw funnelsRes.error;

      const leads = (leadsRes.data || []) as Lead[];
      const positions = (positionsRes.data || []) as LeadStagePosition[];
      const funnels = (funnelsRes.data || []) as LeadFunnel[];

      const funnelMap = new Map(funnels.map(f => [f.id, f]));
      const stageMap = new Map<string, LeadFunnelStage>();
      funnels.forEach(f => (f.lead_funnel_stages || []).forEach((s: LeadFunnelStage) => stageMap.set(s.id, s)));

      const positionsByLead = new Map<string, LeadWithPosition['positions']>();
      positions.forEach(p => {
        const funnel = funnelMap.get(p.funnel_id);
        const stage = stageMap.get(p.stage_id);
        const entry = {
          ...p,
          funnel_name: funnel?.name,
          stage_name: stage?.name,
          funnel_color: funnel?.color,
          stage_color: stage?.color,
        };
        const arr = positionsByLead.get(p.lead_id) || [];
        arr.push(entry);
        positionsByLead.set(p.lead_id, arr);
      });

      return leads.map(lead => ({
        ...lead,
        positions: positionsByLead.get(lead.id) || [],
      })) as LeadWithPosition[];
    },
    refetchInterval: 30000,
  });
}

export function useLeadStats() {
  return useQuery({
    queryKey: ['lead-stats'],
    queryFn: async () => {
      const [leadsRes, positionsRes, funnelsRes] = await Promise.all([
        (supabase as any).from('leads').select('id, created_at, utm_source, utm_medium'),
        (supabase as any).from('lead_stage_positions').select('lead_id, funnel_id, stage_id'),
        (supabase as any).from('lead_funnels').select('id, name, color, lead_funnel_stages(id, name, sort_order)'),
      ]);
      if (leadsRes.error) throw leadsRes.error;
      if (positionsRes.error) throw positionsRes.error;
      if (funnelsRes.error) throw funnelsRes.error;

      const leads = leadsRes.data || [];
      const positions = positionsRes.data || [];
      const funnels = (funnelsRes.data || []) as LeadFunnel[];

      const now = new Date();
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
      const weekAgo = new Date(now.getTime() - 7 * 86400000).toISOString();

      const total = leads.length;
      const newToday = leads.filter((l: any) => l.created_at >= today).length;
      const newWeek = leads.filter((l: any) => l.created_at >= weekAgo).length;

      // Leads por dia (últimos 30 dias)
      const thirtyAgo = new Date(now.getTime() - 30 * 86400000);
      const dailyMap = new Map<string, number>();
      leads.forEach((l: any) => {
        const d = new Date(l.created_at);
        if (d >= thirtyAgo) {
          const key = d.toISOString().slice(0, 10);
          dailyMap.set(key, (dailyMap.get(key) || 0) + 1);
        }
      });
      const dailyLeads = Array.from(dailyMap.entries())
        .map(([date, count]) => ({ date, count }))
        .sort((a, b) => a.date.localeCompare(b.date));

      // Por UTM source
      const sourceMap = new Map<string, number>();
      leads.forEach((l: any) => {
        const src = l.utm_source || 'Direto';
        sourceMap.set(src, (sourceMap.get(src) || 0) + 1);
      });
      const bySource = Array.from(sourceMap.entries())
        .map(([source, count]) => ({ source, count }))
        .sort((a, b) => b.count - a.count);

      // Por UTM source × medium
      const sourceMediumMap = new Map<string, { source: string; medium: string; count: number }>();
      leads.forEach((l: any) => {
        const src = l.utm_source || 'Direto';
        const med = l.utm_medium || '(none)';
        const key = `${src}||${med}`;
        const existing = sourceMediumMap.get(key);
        if (existing) existing.count++;
        else sourceMediumMap.set(key, { source: src, medium: med, count: 1 });
      });
      const bySourceMedium = Array.from(sourceMediumMap.values())
        .sort((a, b) => b.count - a.count);

      // Por funil
      const funnelCountMap = new Map<string, number>();
      positions.forEach((p: any) => {
        funnelCountMap.set(p.funnel_id, (funnelCountMap.get(p.funnel_id) || 0) + 1);
      });
      const byFunnel = funnels.map(f => ({
        id: f.id,
        name: f.name,
        color: f.color,
        count: funnelCountMap.get(f.id) || 0,
      })).sort((a, b) => b.count - a.count);

      return { total, newToday, newWeek, dailyLeads, bySource, bySourceMedium, byFunnel };
    },
    refetchInterval: 30000,
  });
}
