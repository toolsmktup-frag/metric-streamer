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

const BATCH_SIZE = 20;

export function useImportLeads() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ leads, funnelId, stageId, organizationId, onProgress }: ImportParams) => {
      let imported = 0;
      let skipped = 0;

      for (let i = 0; i < leads.length; i += BATCH_SIZE) {
        const batch = leads.slice(i, i + BATCH_SIZE);

        for (const lead of batch) {
          try {
            // Try to find existing lead by email or phone
            let existingLead: any = null;

            if (lead.email) {
              const { data } = await (supabase as any)
                .from('leads')
                .select('id')
                .eq('organization_id', organizationId)
                .eq('email', lead.email)
                .maybeSingle();
              existingLead = data;
            }

            if (!existingLead && lead.phone) {
              const { data } = await (supabase as any)
                .from('leads')
                .select('id')
                .eq('organization_id', organizationId)
                .eq('phone', lead.phone)
                .maybeSingle();
              existingLead = data;
            }

            let leadId: string;

            if (existingLead) {
              leadId = existingLead.id;
              // Update existing lead with new data
              await (supabase as any)
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
                .eq('id', leadId);
            } else {
              // Insert new lead
              const { data: newLead, error } = await (supabase as any)
                .from('leads')
                .insert({
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
                })
                .select('id')
                .single();

              if (error) {
                skipped++;
                continue;
              }
              leadId = newLead.id;
            }

            // Check if already in this funnel stage
            const { data: existingPos } = await (supabase as any)
              .from('lead_stage_positions')
              .select('id')
              .eq('lead_id', leadId)
              .eq('funnel_id', funnelId)
              .eq('stage_id', stageId)
              .maybeSingle();

            if (!existingPos) {
              // Remove from other stages in this funnel
              await (supabase as any)
                .from('lead_stage_positions')
                .delete()
                .eq('lead_id', leadId)
                .eq('funnel_id', funnelId);

              // Insert into target stage
              await (supabase as any)
                .from('lead_stage_positions')
                .insert({
                  lead_id: leadId,
                  funnel_id: funnelId,
                  stage_id: stageId,
                });
            }

            // Record import event
            await (supabase as any)
              .from('lead_events')
              .insert({
                lead_id: leadId,
                funnel_id: funnelId,
                event_name: 'import',
                metadata: { source: 'spreadsheet', ...lead.metadata },
              });

            imported++;
          } catch {
            skipped++;
          }
        }

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
