-- ============================================================
-- Hardening da tabela whatsapp_instance_access
-- Garante que user.organization_id == instance.organization_id
-- e que o organization_id armazenado bate com ambos.
-- Execute no Supabase SQL Editor.
-- ============================================================

-- 1) Trigger de validação para INSERT/UPDATE
CREATE OR REPLACE FUNCTION public.validate_whatsapp_instance_access_org()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_org uuid;
  v_inst_org uuid;
BEGIN
  SELECT organization_id INTO v_user_org
  FROM user_profiles WHERE id = NEW.user_id;

  SELECT organization_id INTO v_inst_org
  FROM whatsapp_instances WHERE id = NEW.instance_id;

  IF v_user_org IS NULL OR v_inst_org IS NULL THEN
    RAISE EXCEPTION 'Usuário ou instância não encontrados';
  END IF;

  IF v_user_org <> v_inst_org THEN
    RAISE EXCEPTION 'Usuário e instância pertencem a organizações diferentes (user=%, inst=%)', v_user_org, v_inst_org;
  END IF;

  IF NEW.organization_id IS NULL OR NEW.organization_id <> v_user_org THEN
    NEW.organization_id := v_user_org;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_whatsapp_instance_access_org ON public.whatsapp_instance_access;
CREATE TRIGGER trg_validate_whatsapp_instance_access_org
BEFORE INSERT OR UPDATE ON public.whatsapp_instance_access
FOR EACH ROW EXECUTE FUNCTION public.validate_whatsapp_instance_access_org();

-- 2) Limpeza opcional de registros corrompidos (revise antes de rodar)
-- DELETE FROM public.whatsapp_instance_access wia
-- USING user_profiles up, whatsapp_instances wi
-- WHERE wia.user_id = up.id
--   AND wia.instance_id = wi.id
--   AND up.organization_id <> wi.organization_id;
