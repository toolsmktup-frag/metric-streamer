-- ============================================================
-- Cron job: recontact-daily (move leads vencidos automaticamente)
-- Rodar no Supabase SQL Editor
-- Executa todo dia à meia-noite (horário de Brasília) = 03:00 UTC
-- ============================================================

-- 1. Habilitar extensões necessárias (se ainda não ativas)
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- 2. Criar cron job que chama recontact-cron diariamente às 03:00 UTC (00:00 BRT)
SELECT cron.schedule(
  'recontact-daily',              -- nome do job
  '0 3 * * *',                    -- todo dia às 03:00 UTC = 00:00 BRT
  $$
  SELECT net.http_post(
    url := 'https://emfbocpmphtftqcezaib.supabase.co/functions/v1/recontact-cron',
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
--   'recontact-daily',
--   '0 3 * * *',
--   $$
--   SELECT net.http_post(
--     url := 'https://emfbocpmphtftqcezaib.supabase.co/functions/v1/recontact-cron',
--     headers := '{"Content-Type":"application/json","Authorization":"Bearer SUA_SERVICE_ROLE_KEY"}'::jsonb,
--     body := '{}'::jsonb
--   );
--   $$
-- );
-- ============================================================

-- Para verificar se o job foi criado:
-- SELECT * FROM cron.job;

-- Para remover o job se necessário:
-- SELECT cron.unschedule('recontact-daily');
