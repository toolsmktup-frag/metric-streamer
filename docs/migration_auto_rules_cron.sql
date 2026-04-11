-- ============================================================
-- Cron job: auto-rules-engine (avalia regras de automação)
-- Rodar no Supabase SQL Editor APÓS criar as tabelas
-- Executa a cada 15 minutos
-- ============================================================

-- 1. Habilitar extensões necessárias (se ainda não ativas)
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- 2. Criar cron job que chama auto-rules-engine a cada 15 minutos
SELECT cron.schedule(
  'auto-rules-engine-cron',       -- nome do job
  '*/15 * * * *',                 -- a cada 15 minutos
  $$
  SELECT net.http_post(
    url := 'https://emfbocpmphtftqcezaib.supabase.co/functions/v1/auto-rules-engine',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key', true)
    ),
    body := '{}'::jsonb
  );
  $$
);

-- ============================================================
-- Para verificar se o job foi criado:
-- SELECT * FROM cron.job WHERE jobname = 'auto-rules-engine-cron';

-- Para remover o job se necessário:
-- SELECT cron.unschedule('auto-rules-engine-cron');
-- ============================================================
