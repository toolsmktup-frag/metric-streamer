import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface LeadTag {
  id: string;
  organization_id: string;
  name: string;
  color: string;
  created_at: string;
}

export interface OrgTagWithUsage {
  id: string;
  name: string;
  color: string;
  usage_count: number;
  created_at: string;
}

const TAG_DEFAULT_COLOR = '#64748b';

async function fetchOrgId(): Promise<string> {
  const { data, error } = await (supabase as any).rpc('get_user_org_id');
  if (error) throw new Error(`Falha ao obter organização: ${error.message}`);
  if (!data) throw new Error('Seu perfil não está vinculado a uma organização.');
  return data as string;
}

/** Lista de tags da organização (para autocomplete) */
export function useOrgTags() {
  return useQuery({
    queryKey: ['org-tags'],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('lead_tags')
        .select('*')
        .order('name', { ascending: true });
      if (error) {
        console.warn('[useOrgTags] error:', error.message);
        return [] as LeadTag[];
      }
      return (data || []) as LeadTag[];
    },
    staleTime: 30_000,
  });
}

/** Tags da org com contagem de uso (para o modal de gestão) */
export function useOrgTagsWithUsage(enabled = true) {
  return useQuery({
    queryKey: ['org-tags-usage'],
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc('get_org_tags_with_usage');
      if (error) throw error;
      return (data || []) as OrgTagWithUsage[];
    },
    enabled,
  });
}

/** Tags atribuídas a um lead */
export function useLeadTags(leadId: string | null) {
  return useQuery({
    queryKey: ['lead-tags', leadId],
    queryFn: async () => {
      if (!leadId) return [] as LeadTag[];
      const { data, error } = await (supabase as any)
        .from('lead_tag_assignments')
        .select('tag:lead_tags(*)')
        .eq('lead_id', leadId);
      if (error) {
        console.warn('[useLeadTags] error:', error.message);
        return [] as LeadTag[];
      }
      return ((data || []) as Array<{ tag: LeadTag }>)
        .map(r => r.tag)
        .filter(Boolean)
        .sort((a, b) => a.name.localeCompare(b.name));
    },
    enabled: !!leadId,
  });
}

/** Adiciona tag ao lead (cria a tag na org se não existir) */
export function useAddTagToLead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ leadId, name }: { leadId: string; name: string }) => {
      const trimmed = name.trim();
      if (!trimmed) throw new Error('Nome da tag vazio');
      const orgId = await fetchOrgId();

      // Try to find existing tag (case-insensitive)
      const { data: existing } = await (supabase as any)
        .from('lead_tags')
        .select('*')
        .eq('organization_id', orgId)
        .ilike('name', trimmed)
        .maybeSingle();

      let tag: LeadTag | null = existing as LeadTag | null;

      if (!tag) {
        const { data: created, error: createErr } = await (supabase as any)
          .from('lead_tags')
          .insert({ organization_id: orgId, name: trimmed, color: TAG_DEFAULT_COLOR })
          .select()
          .single();
        if (createErr) throw createErr;
        tag = created as LeadTag;
      }

      // Assign to lead (idempotent via UNIQUE)
      const { error: assignErr } = await (supabase as any)
        .from('lead_tag_assignments')
        .insert({ lead_id: leadId, tag_id: tag!.id });
      // Ignore unique violation (already linked)
      if (assignErr && assignErr.code !== '23505') throw assignErr;

      return tag!;
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ['lead-tags', vars.leadId] });
      qc.invalidateQueries({ queryKey: ['org-tags'] });
      qc.invalidateQueries({ queryKey: ['org-tags-usage'] });
    },
    onError: (err: any) => toast.error(err?.message || 'Erro ao adicionar tag'),
  });
}

/** Remove tag do lead (não apaga a tag da org) */
export function useRemoveTagFromLead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ leadId, tagId }: { leadId: string; tagId: string }) => {
      const { error } = await (supabase as any)
        .from('lead_tag_assignments')
        .delete()
        .eq('lead_id', leadId)
        .eq('tag_id', tagId);
      if (error) throw error;
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ['lead-tags', vars.leadId] });
      qc.invalidateQueries({ queryKey: ['org-tags-usage'] });
    },
    onError: () => toast.error('Erro ao remover tag'),
  });
}

/** Renomeia uma tag globalmente (afeta todos os leads vinculados) */
export function useRenameOrgTag() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ tagId, newName }: { tagId: string; newName: string }) => {
      const trimmed = newName.trim();
      if (!trimmed) throw new Error('Nome da tag vazio');
      const { error } = await (supabase as any)
        .from('lead_tags')
        .update({ name: trimmed })
        .eq('id', tagId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['org-tags'] });
      qc.invalidateQueries({ queryKey: ['org-tags-usage'] });
      qc.invalidateQueries({ queryKey: ['lead-tags'] });
      toast.success('Tag renomeada');
    },
    onError: (err: any) => {
      if (err?.code === '23505') toast.error('Já existe uma tag com esse nome');
      else toast.error(err?.message || 'Erro ao renomear tag');
    },
  });
}

/** Exclui uma tag da org (cascade remove dos leads) */
export function useDeleteOrgTag() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (tagId: string) => {
      const { error } = await (supabase as any)
        .from('lead_tags')
        .delete()
        .eq('id', tagId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['org-tags'] });
      qc.invalidateQueries({ queryKey: ['org-tags-usage'] });
      qc.invalidateQueries({ queryKey: ['lead-tags'] });
      toast.success('Tag excluída');
    },
    onError: () => toast.error('Erro ao excluir tag'),
  });
}
