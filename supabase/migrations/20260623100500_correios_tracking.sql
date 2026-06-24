-- ═══════════════════════════════════════════════════════════════════
-- RASTREIO CORREIOS — status do objeto atualizado na tela
-- Colunas de status no pedido + histórico de eventos. Preenchidos pela
-- edge function correios-tracking-sync (API oficial CWS/Rastro), via cron.
-- ═══════════════════════════════════════════════════════════════════

ALTER TABLE public.order_shipments
  ADD COLUMN IF NOT EXISTS tracking_last_event  text,
  ADD COLUMN IF NOT EXISTS tracking_event_at    timestamptz,
  ADD COLUMN IF NOT EXISTS tracking_updated_at  timestamptz,
  ADD COLUMN IF NOT EXISTS tracking_delivered   boolean NOT NULL DEFAULT false;

-- tracking_status (já existia) passa a guardar um status normalizado:
--   postado | em_transito | saiu_entrega | entregue | aguardando_retirada | devolvido | erro

CREATE TABLE IF NOT EXISTS public.shipment_tracking_events (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_shipment_id  uuid NOT NULL REFERENCES public.order_shipments(id) ON DELETE CASCADE,
  tracking_code      text,
  event_status       text,        -- normalizado
  event_description  text,        -- texto cru dos Correios
  event_location     text,
  event_at           timestamptz,
  raw                jsonb,
  created_at         timestamptz NOT NULL DEFAULT now(),
  UNIQUE (order_shipment_id, event_description, event_at)
);

CREATE INDEX IF NOT EXISTS idx_tracking_events_shipment ON public.shipment_tracking_events(order_shipment_id);

ALTER TABLE public.shipment_tracking_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated read tracking_events"
  ON public.shipment_tracking_events FOR SELECT TO authenticated USING (true);

CREATE POLICY "Service full access tracking_events"
  ON public.shipment_tracking_events FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Cron: a cada 6h consulta os Correios p/ rastreios ativos (não entregues).
CREATE OR REPLACE FUNCTION public.trigger_correios_sync()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_url text;
  v_key text;
  v_n   int;
BEGIN
  SELECT count(*) INTO v_n
  FROM public.order_shipments
  WHERE tracking_code IS NOT NULL AND tracking_delivered = false;
  IF v_n = 0 THEN RETURN; END IF;

  SELECT value INTO v_url FROM public.cron_secrets WHERE key = 'supabase_url';
  SELECT value INTO v_key FROM public.cron_secrets WHERE key = 'dispatch_token';
  IF v_url IS NULL OR v_key IS NULL THEN
    RAISE WARNING 'trigger_correios_sync: cron_secrets não configurados.';
    RETURN;
  END IF;

  PERFORM net.http_post(
    url     := v_url || '/functions/v1/correios-tracking-sync',
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || v_key),
    body    := '{}'::jsonb
  );
END;
$$;

SELECT cron.unschedule('correios-sync-6h')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'correios-sync-6h');

SELECT cron.schedule(
  'correios-sync-6h',
  '15 */6 * * *',
  $$ SELECT public.trigger_correios_sync(); $$
);
