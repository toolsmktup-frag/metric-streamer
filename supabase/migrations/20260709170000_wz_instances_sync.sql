-- ─────────────────────────────────────────────────────────────────
-- Instâncias em dobro: whatsapp_instances (chat) × wz_instances
-- (motor de automação/grupos). O dropdown das automações de grupo lê
-- wz_instances, então instância conectada só no chat "não aparece pra
-- selecionar" (caso 09/07: 48992112108, silvia, SoulNaturi).
--
-- Correção durável: espelho automático whatsapp_instances → wz_instances
-- por trigger (match pelo token). Backfill incluso.
-- ─────────────────────────────────────────────────────────────────

-- Token identifica a instância na UazAPI → chave natural do espelho.
CREATE UNIQUE INDEX IF NOT EXISTS uq_wz_instances_api_key ON public.wz_instances(api_key);

CREATE OR REPLACE FUNCTION public.sync_wz_instance_from_whatsapp()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.api_token IS NULL OR NEW.api_url IS NULL THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.wz_instances (name, api_url, api_key, status)
  VALUES (
    COALESCE(NEW.instance_name, NEW.phone_number, 'instância'),
    NEW.api_url,
    NEW.api_token,
    COALESCE(NEW.status, 'disconnected')
  )
  ON CONFLICT (api_key) DO UPDATE SET
    name       = EXCLUDED.name,
    api_url    = EXCLUDED.api_url,
    status     = EXCLUDED.status,
    updated_at = now();

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_whatsapp_instances_wz_sync ON public.whatsapp_instances;
CREATE TRIGGER trg_whatsapp_instances_wz_sync
  AFTER INSERT OR UPDATE OF instance_name, api_url, api_token, status ON public.whatsapp_instances
  FOR EACH ROW EXECUTE FUNCTION public.sync_wz_instance_from_whatsapp();

-- Backfill: espelha tudo que existe hoje no chat (insere faltantes e
-- corrige status defasado dos já espelhados).
INSERT INTO public.wz_instances (name, api_url, api_key, status)
SELECT COALESCE(w.instance_name, w.phone_number, 'instância'), w.api_url, w.api_token, COALESCE(w.status, 'disconnected')
FROM public.whatsapp_instances w
WHERE w.api_token IS NOT NULL AND w.api_url IS NOT NULL
ON CONFLICT (api_key) DO UPDATE SET
  name       = EXCLUDED.name,
  api_url    = EXCLUDED.api_url,
  status     = EXCLUDED.status,
  updated_at = now();
