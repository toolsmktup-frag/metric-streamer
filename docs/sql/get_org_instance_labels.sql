-- ============================================================
-- RPC: get_org_instance_labels
-- Retorna {id, label, created_at} de TODAS as instâncias da org
-- do usuário autenticado, ignorando RLS de whatsapp_instances.
-- Seguro: só expõe metadado de label (não retorna api_key/api_url).
-- Execute no Supabase SQL Editor.
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_org_instance_labels()
RETURNS TABLE (id uuid, label text, created_at timestamptz)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT i.id,
         COALESCE(NULLIF(i.nickname, ''), NULLIF(i.display_name, ''), i.instance_name, 'Instância') AS label,
         i.created_at
  FROM whatsapp_instances i
  WHERE i.organization_id = (
    SELECT organization_id FROM user_profiles WHERE id = auth.uid()
  )
  ORDER BY i.created_at ASC;
$$;

GRANT EXECUTE ON FUNCTION public.get_org_instance_labels() TO authenticated;
