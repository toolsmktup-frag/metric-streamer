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

/**
 * Deduplicate leads within the batch by email/phone.
 * Keeps the last occurrence (richer data), merges metadata.
 * Returns a map of dedup key -> { lead, eventLeads[] } so we can
 * still create one event per original row.
 */
function deduplicateBatch(batch: ImportLead[]) {
  const byKey = new Map<string, { lead: ImportLead; allRows: ImportLead[] }>();

  for (const lead of batch) {
    const key = lead.email?.toLowerCase() || lead.phone || `anon-${Math.random()}`;
    const existing = byKey.get(key);
    if (existing) {
      // Merge: keep non-null fields from latest row
      existing.lead = {
        ...existing.lead,
        name: lead.name || existing.lead.name,
        utm_source: lead.utm_source || existing.lead.utm_source,
        utm_medium: lead.utm_medium || existing.lead.utm_medium,
        utm_campaign: lead.utm_campaign || existing.lead.utm_campaign,
        utm_content: lead.utm_content || existing.lead.utm_content,
        utm_term: lead.utm_term || existing.lead.utm_term,
        metadata: { ...existing.lead.metadata, ...lead.metadata },
      };
      existing.allRows.push(lead);
    } else {
      byKey.set(key, { lead, allRows: [lead] });
    }
  }

  return byKey;
}

function mapStatusToEventName(status: string): string {
  const s = status.toLowerCase().trim();
  if (['authorized', 'approved', 'paid', 'aprovada', 'aprovado'].includes(s)) return 'pago';
  if (['waiting_payment', 'pending', 'aguardando pagamento'].includes(s)) return 'pix_gerado';
  if (['pix_created'].includes(s)) return 'pix_gerado';
  if (['bank_slip_created', 'billet_printed', 'boleto'].includes(s)) return 'boleto_gerado';
  if (['rejected', 'refused', 'rejeitada', 'rejeitado'].includes(s)) return 'rejeitado';
  if (['canceled', 'cancelled', 'cancelada', 'cancelado'].includes(s)) return 'cancelado';
  if (['expired', 'expirada', 'expirado'].includes(s)) return 'expirado';
  if (['refunded', 'reembolsada', 'reembolsado'].includes(s)) return 'reembolsado';
  if (['chargeback', 'chargedback'].includes(s)) return 'chargeback';
  if (['open', 'checkout'].includes(s)) return 'open';
  return s || 'import';
}

/**
 * Build a rich event from an imported row, using the actual status/product
 * instead of a generic "import" label.
 */
function buildEvent(
  leadId: string,
  funnelId: string,
  row: ImportLead,
): { lead_id: string; funnel_id: string; event_name: string; created_at: string; metadata: Record<string, unknown> } {
  const status = ((row.metadata.status as string) || '').toLowerCase().trim();
  const eventName = mapStatusToEventName(status);

  const purchasedAt = row.metadata.purchased_at as string | null;
  const createdAt = purchasedAt || new Date().toISOString();

  return {
    lead_id: leadId,
    funnel_id: funnelId,
    event_name: eventName,
    created_at: createdAt,
    metadata: {
      source: 'spreadsheet',
      product_name: row.metadata.product_name || null,
      offer_name: row.metadata.offer_name || null,
      amount: row.metadata.amount || null,
      payment_method: row.metadata.payment_method || null,
      platform: row.metadata.platform || null,
      purchased_at: row.metadata.purchased_at || null,
      original_date: purchasedAt || null,
      ...Object.fromEntries(
        Object.entries(row.metadata).filter(
          ([k]) => !['status', 'product_name', 'offer_name', 'amount', 'payment_method', 'platform', 'purchased_at'].includes(k),
        ),
      ),
    },
  };
}

function buildLeadImportadoEvent(
  leadId: string,
  funnelId: string,
  row: ImportLead,
): { lead_id: string; funnel_id: string; event_name: string; created_at: string; metadata: Record<string, unknown> } {
  const purchasedAt = row.metadata.purchased_at as string | null;
  const createdAt = purchasedAt || new Date().toISOString();
  return {
    lead_id: leadId,
    funnel_id: funnelId,
    event_name: 'lead_importado',
    created_at: createdAt,
    metadata: { source: 'spreadsheet', original_date: purchasedAt || null },
  };
}

export function useImportLeads() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ leads, funnelId, stageId, organizationId, onProgress }: ImportParams) => {
      let imported = 0;
      let skipped = 0;

      for (let i = 0; i < leads.length; i += BATCH_SIZE) {
        const batch = leads.slice(i, i + BATCH_SIZE);

        // 1) Deduplicate within the batch (same email appearing 2x in CSV)
        const dedupMap = deduplicateBatch(batch);
        const uniqueLeads = Array.from(dedupMap.values());

        // 2) Batch-fetch existing leads by email and phone
        const emails = uniqueLeads.map(u => u.lead.email).filter(Boolean) as string[];
        const phones = uniqueLeads.map(u => u.lead.phone).filter(Boolean) as string[];

        const existingByEmail: Record<string, string> = {};
        const existingByPhone: Record<string, string> = {};

        const fetchPromises: Promise<void>[] = [];

        if (emails.length > 0) {
          fetchPromises.push(
            (supabase as any)
              .from('leads')
              .select('id, email')
              .eq('organization_id', organizationId)
              .in('email', emails)
              .then(({ data }: any) => {
                for (const row of data || []) existingByEmail[row.email] = row.id;
              }),
          );
        }

        if (phones.length > 0) {
          fetchPromises.push(
            (supabase as any)
              .from('leads')
              .select('id, phone')
              .eq('organization_id', organizationId)
              .in('phone', phones)
              .then(({ data }: any) => {
                for (const row of data || []) existingByPhone[row.phone] = row.id;
              }),
          );
        }

        await Promise.all(fetchPromises);

        // 3) Separate into existing vs new, and resolve lead IDs
        const leadIdMap = new Map<ImportLead, string>(); // unique lead -> resolved id
        const toUpdate: { id: string; lead: ImportLead }[] = [];
        const toInsert: ImportLead[] = [];

        for (const { lead } of uniqueLeads) {
          const existingId =
            (lead.email && existingByEmail[lead.email]) ||
            (lead.phone && existingByPhone[lead.phone]);

          if (existingId) {
            toUpdate.push({ id: existingId, lead });
            leadIdMap.set(lead, existingId);
          } else {
            toInsert.push(lead);
          }
        }

        // 4) Parallel update existing leads
        if (toUpdate.length > 0) {
          await Promise.all(
            toUpdate.map(({ id, lead }) =>
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
                .eq('id', id),
            ),
          );
        }

        // 5) Insert new leads one-by-one to avoid batch failure on constraint violation
        if (toInsert.length > 0) {
          const insertResults = await Promise.all(
            toInsert.map(async (lead) => {
              const { data, error } = await (supabase as any)
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
                // If insert fails (duplicate constraint), try to find existing
                const { data: found } = await (supabase as any)
                  .from('leads')
                  .select('id')
                  .eq('organization_id', organizationId)
                  .or(
                    [
                      lead.email ? `email.eq.${lead.email}` : null,
                      lead.phone ? `phone.eq.${lead.phone}` : null,
                    ]
                      .filter(Boolean)
                      .join(','),
                  )
                  .limit(1)
                  .single();

                if (found) {
                  leadIdMap.set(lead, found.id);
                  return found.id as string;
                }
                return null; // truly skipped
              }

              leadIdMap.set(lead, data.id);
              return data.id as string;
            }),
          );

          skipped += insertResults.filter((r) => r === null).length;
        }

        // 6) Collect all resolved lead IDs
        const allLeadIds = Array.from(leadIdMap.values());

        if (allLeadIds.length === 0) {
          onProgress?.(Math.min(i + BATCH_SIZE, leads.length), leads.length);
          continue;
        }

        // 7) Handle stage positions (batch fetch, then insert missing)
        const { data: existingPositions } = await (supabase as any)
          .from('lead_stage_positions')
          .select('id, lead_id, stage_id')
          .eq('funnel_id', funnelId)
          .in('lead_id', allLeadIds);

        const positionMap = new Map<string, { id: string; stage_id: string }>();
        for (const pos of existingPositions || []) {
          positionMap.set(pos.lead_id, { id: pos.id, stage_id: pos.stage_id });
        }

        const positionsToDelete: string[] = [];
        const positionsToInsert: { lead_id: string; funnel_id: string; stage_id: string; entered_at?: string }[] = [];

        for (const leadId of allLeadIds) {
          const existing = positionMap.get(leadId);
          // Find the original row to get purchased_at for entered_at
          const matchingEntry = uniqueLeads.find(u => leadIdMap.get(u.lead) === leadId);
          const purchasedAt = matchingEntry?.lead.metadata?.purchased_at as string | undefined;

          if (existing) {
            if (existing.stage_id !== stageId) {
              positionsToDelete.push(existing.id);
              positionsToInsert.push({
                lead_id: leadId, funnel_id: funnelId, stage_id: stageId,
                ...(purchasedAt ? { entered_at: purchasedAt } : {}),
              });
            }
          } else {
            positionsToInsert.push({
              lead_id: leadId, funnel_id: funnelId, stage_id: stageId,
              ...(purchasedAt ? { entered_at: purchasedAt } : {}),
            });
          }
        }

        const posPromises: Promise<any>[] = [];
        if (positionsToDelete.length > 0) {
          posPromises.push(
            (supabase as any).from('lead_stage_positions').delete().in('id', positionsToDelete),
          );
        }
        if (positionsToInsert.length > 0) {
          posPromises.push(
            (supabase as any).from('lead_stage_positions').insert(positionsToInsert),
          );
        }
        await Promise.all(posPromises);

        // 8) Create one event per ORIGINAL row (not deduplicated), preserving full history
        const events: ReturnType<typeof buildEvent>[] = [];
        for (const { lead, allRows } of uniqueLeads) {
          const resolvedId = leadIdMap.get(lead);
          if (!resolvedId) continue;

          for (const row of allRows) {
            events.push(buildEvent(resolvedId, funnelId, row));
          }
        }

        if (events.length > 0) {
          await (supabase as any).from('lead_events').insert(events);
        }

        imported += allLeadIds.length;
        onProgress?.(Math.min(i + BATCH_SIZE, leads.length), leads.length);
      }

      return { imported, skipped };
    },
    onSuccess: (result, vars) => {
      queryClient.invalidateQueries({ queryKey: ['leads-by-funnel', vars.funnelId] });
      queryClient.invalidateQueries({ queryKey: ['funnel-lead-counts', vars.funnelId] });
      toast.success(
        `${result.imported} leads importados${result.skipped > 0 ? `, ${result.skipped} ignorados` : ''}`,
      );
    },
    onError: () => {
      toast.error('Erro durante importação');
    },
  });
}
