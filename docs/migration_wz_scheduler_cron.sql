-- ============================================================
-- Cron job: wz-scheduler (processa timers de automação)
-- Rodar no Supabase SQL Editor
-- ============================================================

-- 1. Habilitar extensões necessárias (se ainda não ativas)
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- 2. Criar cron job que chama wz-scheduler a cada 1 minuto
SELECT cron.schedule(
  'wz-scheduler-cron',           -- nome do job
  '* * * * *',                    -- a cada minuto
  $$
  SELECT net.http_post(
    url := 'https://emfbocpmphtftqcezaib.supabase.co/functions/v1/wz-scheduler',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key', true)
    ),
    body := '{}'::jsonb
  );
  $$
);

-- ============================================================
-- ALTERNATIVA: Se current_setting não funcionar, cole a
-- service_role_key diretamente (menos seguro):
--
-- SELECT cron.schedule(
--   'wz-scheduler-cron',
--   '* * * * *',
--   $$
--   SELECT net.http_post(
--     url := 'https://emfbocpmphtftqcezaib.supabase.co/functions/v1/wz-scheduler',
--     headers := '{"Content-Type":"application/json","Authorization":"Bearer SUA_SERVICE_ROLE_KEY"}'::jsonb,
--     body := '{}'::jsonb
--   );
--   $$
-- );
-- ============================================================

-- Para verificar se o job foi criado:
-- SELECT * FROM cron.job;

-- Para remover o job se necessário:
-- SELECT cron.unschedule('wz-scheduler-cron');
