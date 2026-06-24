-- ─────────────────────────────────────────────────────────────────
-- Disparo controlado de rastreio: cron processa a fila (na_fila) a cada
-- minuto, em lotes com intervalo entre envios (ritmo anti-ban no UazAPI;
-- o canal ManyChat oficial não tem risco). Mesmo padrão do auto-sync Meta.
-- Requer pg_cron, pg_net e os settings app.supabase_url / app.service_role_key.
-- ─────────────────────────────────────────────────────────────────

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

CREATE OR REPLACE FUNCTION public.trigger_tracking_dispatch()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_url text;
  v_key text;
  v_pending int;
BEGIN
  -- Nada na fila → não chama a function (economiza invocações)
  SELECT count(*) INTO v_pending
  FROM public.order_shipments
  WHERE dispatch_status = 'na_fila';
  IF v_pending = 0 THEN
    RETURN;
  END IF;

  v_url := current_setting('app.supabase_url', true) || '/functions/v1/enqueue-tracking-dispatch';
  v_key := current_setting('app.service_role_key', true);

  IF v_key IS NULL OR v_url = '/functions/v1/enqueue-tracking-dispatch' THEN
    RAISE WARNING 'trigger_tracking_dispatch: app.supabase_url ou app.service_role_key não configurados.';
    RETURN;
  END IF;

  PERFORM net.http_post(
    url     := v_url,
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer ' || v_key,
      'apikey',        v_key
    ),
    body    := '{}'::jsonb
  );
END;
$$;

-- Agendar a cada minuto. Idempotente: remove agendamento anterior se existir.
SELECT cron.unschedule('dispatch-tracking-1min')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'dispatch-tracking-1min');

SELECT cron.schedule(
  'dispatch-tracking-1min',
  '* * * * *',
  $$ SELECT public.trigger_tracking_dispatch(); $$
);
