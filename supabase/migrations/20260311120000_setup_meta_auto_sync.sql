-- ─────────────────────────────────────────────────────────────────
-- Auto-sync Meta Ads: roda a cada hora, sincroniza hoje + ontem
-- Requer: extensões pg_cron e pg_net habilitadas no projeto Supabase
-- ─────────────────────────────────────────────────────────────────

-- 1. Habilitar extensões necessárias
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- 2. Criar função auxiliar que dispara o sync
CREATE OR REPLACE FUNCTION public.trigger_meta_sync_auto()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_url      text;
  v_key      text;
  v_date_from text;
  v_date_to   text;
BEGIN
  -- Lê URL e service role key das configurações do banco
  -- Configure executando no SQL Editor do Supabase:
  --   ALTER DATABASE postgres SET app.supabase_url = 'https://SEU_PROJECT_ID.supabase.co';
  --   ALTER DATABASE postgres SET app.service_role_key = 'SUA_SERVICE_ROLE_KEY';
  v_url := current_setting('app.supabase_url', true) || '/functions/v1/sync-meta';
  v_key := current_setting('app.service_role_key', true);

  -- Se as configurações não estiverem definidas, aborta silenciosamente
  IF v_url IS NULL OR v_key IS NULL OR v_url = '/functions/v1/sync-meta' THEN
    RAISE WARNING 'trigger_meta_sync_auto: app.supabase_url ou app.service_role_key não configurados. Sync automático ignorado.';
    RETURN;
  END IF;

  v_date_from := (CURRENT_DATE - INTERVAL '1 day')::text;
  v_date_to   := CURRENT_DATE::text;

  PERFORM net.http_post(
    url     := v_url,
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer ' || v_key,
      'apikey',        v_key
    ),
    body    := jsonb_build_object(
      'date_from',  v_date_from,
      'date_to',    v_date_to,
      'full_sync',  false
    )
  );
END;
$$;

-- 3. Agendar: todo dia às 00:00, 06:00, 12:00, 18:00 (UTC)
--    Ajuste o cron conforme seu fuso: Brasil = UTC-3, então 06:00 UTC = 03:00 BRT
SELECT cron.schedule(
  'auto-sync-meta-6h',       -- nome do job (único)
  '0 0,6,12,18 * * *',       -- a cada 6 horas
  $$ SELECT public.trigger_meta_sync_auto(); $$
);
