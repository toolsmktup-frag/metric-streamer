-- ============================================================================
-- ATIVAÇÃO da recompra automática (cron) — Fase 1B
-- ============================================================================
-- A edge function `recontact-cron` JÁ está deployada e com a lógica corrigida
-- (lê customer_purchases + quantidade de potes, espelha o front; ver
-- supabase/functions/recontact-cron/index.ts). Este script LIGA o agendamento.
--
-- Rodar no Supabase SQL Editor (uma vez). Requer a service_role key — por isso
-- é um passo manual do dono, não uma migration automática.
-- ============================================================================

-- 0) Extensões (idempotente)
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- ─────────────────────────────────────────────────────────────────────────────
-- PASSO 1 (uma vez): teste em DRY-RUN antes de ligar.
-- No terminal, com a sua service_role key (Dashboard > Settings > API):
--
--   curl -s -X POST \
--     'https://emfbocpmphtftqcezaib.supabase.co/functions/v1/recontact-cron' \
--     -H 'Authorization: Bearer <SERVICE_ROLE_KEY>' \
--     -H 'Content-Type: application/json' \
--     -d '{"dry_run": true}'
--
-- Confira `would_move` e `would_move_by_from_stage` no retorno. Estimativa atual
-- (2026-06-11): ~1 lead. Se o número fizer sentido, prossiga.
-- ─────────────────────────────────────────────────────────────────────────────

-- PASSO 2 (uma vez): registrar a service_role key como setting do banco, para o
-- cron autenticar sem expor a chave no comando agendado.
-- ⚠️ Substitua <SERVICE_ROLE_KEY> pela chave real. Requer privilégio de superuser
--    no SQL Editor do Supabase.
ALTER DATABASE postgres SET app.settings.service_role_key = '<SERVICE_ROLE_KEY>';
-- (a setting passa a valer em novas conexões; o pg_cron abre conexão nova a cada run)

-- PASSO 3: agendar. Roda todo dia às 11:00 UTC (08:00 BRT) — leads vencidos
-- aparecem em "Para abordar hoje" logo cedo. Ajuste o horário se quiser.
SELECT cron.schedule(
  'recontact-daily',
  '0 11 * * *',
  $$
  SELECT net.http_post(
    url := 'https://emfbocpmphtftqcezaib.supabase.co/functions/v1/recontact-cron',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key', true)
    ),
    body := '{}'::jsonb   -- live (sem dry_run). Move de verdade.
  );
  $$
);

-- ============================================================================
-- Verificar:        SELECT jobname, schedule, active FROM cron.job;
-- Ver execuções:    SELECT * FROM cron.job_run_details ORDER BY start_time DESC LIMIT 10;
-- Desligar:         SELECT cron.unschedule('recontact-daily');
-- ============================================================================
