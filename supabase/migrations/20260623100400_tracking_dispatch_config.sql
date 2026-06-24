-- No Supabase gerenciado o role `postgres` não é superuser → ALTER DATABASE SET
-- app.* falha. Em vez de GUCs, guardamos a url + um TOKEN DEDICADO de disparo
-- (NÃO a service_role key) numa tabela privada (RLS sem policies = só
-- service_role/postgres acessam). O token só autoriza a edge function de
-- disparo (least privilege). Os VALORES entram fora do git (via API/SQL Editor).

CREATE TABLE IF NOT EXISTS public.cron_secrets (
  key        text PRIMARY KEY,
  value      text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.cron_secrets ENABLE ROW LEVEL SECURITY;
-- Sem policies para authenticated/anon → ninguém do front lê. service_role e o
-- dono (postgres, via SECURITY DEFINER) ignoram RLS.

CREATE OR REPLACE FUNCTION public.trigger_tracking_dispatch()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_url     text;
  v_key     text;
  v_pending int;
BEGIN
  SELECT count(*) INTO v_pending
  FROM public.order_shipments
  WHERE dispatch_status = 'na_fila';
  IF v_pending = 0 THEN
    RETURN;
  END IF;

  SELECT value INTO v_url FROM public.cron_secrets WHERE key = 'supabase_url';
  SELECT value INTO v_key FROM public.cron_secrets WHERE key = 'dispatch_token';

  IF v_url IS NULL OR v_key IS NULL THEN
    RAISE WARNING 'trigger_tracking_dispatch: cron_secrets (supabase_url/dispatch_token) não configurados.';
    RETURN;
  END IF;

  -- Função é verify_jwt=false e faz a própria auth via TRACKING_DISPATCH_SECRET.
  PERFORM net.http_post(
    url     := v_url || '/functions/v1/enqueue-tracking-dispatch',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer ' || v_key
    ),
    body    := '{}'::jsonb
  );
END;
$$;
