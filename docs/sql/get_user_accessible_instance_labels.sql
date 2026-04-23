-- ============================================================
-- RPC: get_user_accessible_instance_labels
-- Retorna {id, label, created_at} APENAS das instâncias que o
-- usuário autenticado tem permissão de ver:
--   - admin/gestor: todas as instâncias da org
--   - vendedor: apenas as instâncias listadas em whatsapp_instance_access
-- Substitui get_org_instance_labels (que vazava todas as instâncias da org).
-- Execute no Supabase SQL Editor.
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_user_accessible_instance_labels()
RETURNS TABLE (id uuid, label text, created_at timestamptz)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_org_id uuid;
  v_role text;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN;
  END IF;

  SELECT up.organization_id, up.role
    INTO v_org_id, v_role
  FROM user_profiles up
  WHERE up.id = v_user_id;

  IF v_org_id IS NULL THEN
    RETURN;
  END IF;

  IF v_role IN ('admin', 'gestor') THEN
    RETURN QUERY
      SELECT i.id,
             COALESCE(NULLIF(i.nickname, ''), NULLIF(i.display_name, ''), i.instance_name, 'Instância') AS label,
             i.created_at
      FROM whatsapp_instances i
      WHERE i.organization_id = v_org_id
      ORDER BY i.created_at ASC;
  ELSE
    RETURN QUERY
      SELECT i.id,
             COALESCE(NULLIF(i.nickname, ''), NULLIF(i.display_name, ''), i.instance_name, 'Instância') AS label,
             i.created_at
      FROM whatsapp_instances i
      JOIN whatsapp_instance_access wia
        ON wia.instance_id = i.id
       AND wia.user_id = v_user_id
      WHERE i.organization_id = v_org_id
      ORDER BY i.created_at ASC;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_user_accessible_instance_labels() TO authenticated;
