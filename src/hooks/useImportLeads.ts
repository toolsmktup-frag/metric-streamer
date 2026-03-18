import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface ImportLead {
  name: string | null;
  email: string | null;
  phone: string | null;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  utm_content: string | null;
  utm_term: string | null;
  metadata: Record<string, unknown>;
}

interface ImportParams {
  leads: ImportLead[];
  funnelId: string;
  stageId: string;
  organizationId: string;
  onProgress?: (done: number, total: number) => void;
}

const BATCH_SIZE = 100;

export function useImportLeads() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ leads, funnelId, stageId, organizationId, onProgress }: ImportParams) => {
      let imported = 0;
      let skipped = 0;

      for (let i = 0; i < leads.length; i += BATCH_SIZE) {
        const batch = leads.slice(i, i + BATCH_SIZE);

        // 1) Collect unique emails and phones from this batch
        const emails = batch.map(l => l.email).filter(Boolean) as string[];
        const phones = batch.map(l => l.phone).filter(Boolean) as string[];

        // 2) Batch-fetch existing leads by email and phone (2 queries instead of 2*N)
        const existingByEmail: Record<string, string> = {};
        const existingByPhone: Record<string, string> = {};

        if (emails.length > 0) {
          const { data } = await (supabase as any)
            .from('leads')
            .select('id, email')
            .eq('organization_id', organizationId)
            .in('email', emails);
          for (const row of data || []) {
            existingByEmail[row.email] = row.id;
          }
        }

        if (phones.length > 0) {
          const { data } = await (supabase as any)
            .from('leads')
            .select('id, phone')
            .eq('organization_id', organizationId)
            .in('phone', phones);
          for (const row of data || []) {
            existingByPhone[row.phone] = row.id;
          }
        }

        // 3) Separate into existing vs new leads
        const toUpdate: { id: string; lead: ImportLead }[] = [];
        const toInsert: ImportLead[] = [];

        for (const lead of batch) {
          const existingId = (lead.email && existingByEmail[lead.email])
            || (lead.phone && existingByPhone[lead.phone]);

          if (existingId) {
            toUpdate.push({ id: existingId, lead });
          } else {
            toInsert.push(lead);
          }
        }

        // 4) Batch update existing leads (1 query per lead, but could be parallelized)
        // Use Promise.all for parallel updates
        await Promise.all(toUpdate.map(({ id, lead }) =>
          (supabase as any)
            .from('leads')
            .update({
              name: lead.name || undefined,
              utm_source: lead.utm_source || undefined,
              utm_medium: lead.utm_medium || undefined,
              utm_campaign: lead.utm_campaign || undefined,
              utm_content: lead.utm_content || undefined,
              utm_term: lead.utm_term || undefined,
              metadata: lead.metadata,
            })
            .eq('id', id)
        ));

        // 5) Batch insert new leads (1 query for all new leads)
        const insertedIds: { id: string; email: string | null; phone: string | null }[] = [];

        if (toInsert.length > 0) {
          const { data: newLeads, error } = await (supabase as any)
            .from('leads')
            .insert(toInsert.map(lead => ({
              organization_id: organizationId,
              name: lead.name,
              email: lead.email,
              phone: lead.phone,
              utm_source: lead.utm_source,
              utm_medium: lead.utm_medium,
              utm_campaign: lead.utm_campaign,
              utm_content: lead.utm_content,
              utm_term: lead.utm_term,
              metadata: lead.metadata,
            })))
            .select('id, email, phone');

          if (error) {
            skipped += toInsert.length;
          } else {
            for (const nl of newLeads || []) {
              insertedIds.push(nl);
            }
          }
        }

        // 6) Build complete lead ID list for this batch
        const allLeadIds: string[] = [
          ...toUpdate.map(u => u.id),
          ...insertedIds.map(n => n.id),
        ];

        if (allLeadIds.length === 0) {
          onProgress?.(Math.min(i + BATCH_SIZE, leads.length), leads.length);
          continue;
        }

        // 7) Batch-fetch existing positions in this funnel (1 query)
        const { data: existingPositions } = await (supabase as any)
          .from('lead_stage_positions')
          .select('id, lead_id, stage_id')
          .eq('funnel_id', funnelId)
          .in('lead_id', allLeadIds);

        const positionMap = new Map<string, { id: string; stage_id: string }>();
        for (const pos of existingPositions || []) {
          positionMap.set(pos.lead_id, { id: pos.id, stage_id: pos.stage_id });
        }

        // 8) Determine which positions to delete and which to insert
        const positionsToDelete: string[] = [];
        const positionsToInsert: { lead_id: string; funnel_id: string; stage_id: string }[] = [];

        for (const leadId of allLeadIds) {
          const existing = positionMap.get(leadId);
          if (existing) {
            if (existing.stage_id !== stageId) {
              positionsToDelete.push(existing.id);
              positionsToInsert.push({ lead_id: leadId, funnel_id: funnelId, stage_id: stageId });
            }
            // If already in correct stage, skip
          } else {
            positionsToInsert.push({ lead_id: leadId, funnel_id: funnelId, stage_id: stageId });
          }
        }

        // 9) Batch delete old positions (1 query)
        if (positionsToDelete.length > 0) {
          await (supabase as any)
            .from('lead_stage_positions')
            .delete()
            .in('id', positionsToDelete);
        }

        // 10) Batch insert new positions (1 query)
        if (positionsToInsert.length > 0) {
          await (supabase as any)
            .from('lead_stage_positions')
            .insert(positionsToInsert);
        }

        // 11) Batch insert events (1 query)
        const events = allLeadIds.map(leadId => {
          const lead = batch.find(l => {
            const lid = (l.email && existingByEmail[l.email])
              || (l.phone && existingByPhone[l.phone]);
            return lid === leadId || insertedIds.some(n => n.id === leadId &&
              ((n.email && n.email === l.email) || (n.phone && n.phone === l.phone)));
          });

          return {
            lead_id: leadId,
            funnel_id: funnelId,
            event_name: 'import',
            metadata: { source: 'spreadsheet', ...(lead?.metadata || {}) },
          };
        });

        await (supabase as any)
          .from('lead_events')
          .insert(events);

        imported += allLeadIds.length;
        onProgress?.(Math.min(i + BATCH_SIZE, leads.length), leads.length);
      }

      return { imported, skipped };
    },
    onSuccess: (result, vars) => {
      queryClient.invalidateQueries({ queryKey: ['leads-by-funnel', vars.funnelId] });
      queryClient.invalidateQueries({ queryKey: ['funnel-lead-counts', vars.funnelId] });
      toast.success(`${result.imported} leads importados${result.skipped > 0 ? `, ${result.skipped} ignorados` : ''}`);
    },
    onError: () => {
      toast.error('Erro durante importação');
    },
  });
}
