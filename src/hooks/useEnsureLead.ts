import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { Lead } from '@/types/leadFunnels';

/**
 * Garante que existe um Lead no CRM para o telefone informado.
 * - Se já existir na org, retorna; se for vendedor sem assigned_to, reivindica para si.
 * - Se não existir, cria (com assigned_to = usuário atual quando vendedor).
 *
 * Backend: RPC ensure_lead_for_phone (SECURITY DEFINER).
 */
export function useEnsureLead() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({ phone, name }: { phone: string; name?: string | null }) => {
      const { data, error } = await (supabase as any).rpc('ensure_lead_for_phone', {
        p_phone: phone,
        p_name: name ?? null,
      });
      if (error) throw error;
      return data as Lead;
    },
    onSuccess: (lead) => {
      if (!lead?.phone) return;
      qc.invalidateQueries({ queryKey: ['lead-by-phone'] });
      qc.invalidateQueries({ queryKey: ['lead-tags', lead.id] });
    },
  });
}
