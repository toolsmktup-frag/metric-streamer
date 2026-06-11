-- ============================================================================
-- Recompra automática (cron) — Fase 1B — JÁ ATIVADO em 2026-06-11
-- ============================================================================
-- A edge function `recontact-cron` está deployada com a lógica corrigida
-- (lê customer_purchases + quantidade de potes; ver
-- supabase/functions/recontact-cron/index.ts) e o cron já está agendado e ativo.
--
-- Autenticação: a função aceita um SEGREDO DEDICADO (env RECONTACT_CRON_SECRET,
-- baixo privilégio — só dispara esta função), em vez da service_role key. O cron
-- envia esse segredo no header Authorization. Foi assim que se evitou expor a
-- chave-mestra do projeto.
--
-- Este arquivo é REFERÊNCIA/gerência. O agendamento já foi feito.
-- ============================================================================

-- Extensões (idempotente — já ativas)
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- ─────────────────────────────────────────────────────────────────────────────
-- COMO FOI AGENDADO (diário às 11:00 UTC = 08:00 BRT). Para REagendar, troque
-- <RECONTACT_CRON_SECRET> pelo valor do secret da função:
--
--   SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname='recontact-daily';
--   SELECT cron.schedule('recontact-daily', '0 11 * * *', $cron$
--     SELECT net.http_post(
--       url := 'https://emfbocpmphtftqcezaib.supabase.co/functions/v1/recontact-cron',
--       headers := jsonb_build_object('Content-Type','application/json',
--                                     'Authorization','Bearer <RECONTACT_CRON_SECRET>'),
--       body := '{}'::jsonb
--     );
--   $cron$);
-- ─────────────────────────────────────────────────────────────────────────────

-- TESTAR em ensaio (não move nada). No terminal, com o segredo do cron:
--   curl -s -X POST 'https://emfbocpmphtftqcezaib.supabase.co/functions/v1/recontact-cron' \
--     -H 'Authorization: Bearer <RECONTACT_CRON_SECRET>' \
--     -H 'Content-Type: application/json' -d '{"dry_run": true}'

-- ============================================================================
-- Verificar:        SELECT jobname, schedule, active FROM cron.job WHERE jobname='recontact-daily';
-- Ver execuções:    SELECT * FROM cron.job_run_details WHERE command LIKE '%recontact-cron%' ORDER BY start_time DESC LIMIT 10;
-- Desligar:         SELECT cron.unschedule('recontact-daily');
-- Trocar o segredo: supabase secrets set RECONTACT_CRON_SECRET=<novo> --project-ref emfbocpmphtftqcezaib
--                   (depois reagende o cron com o novo valor)
-- ============================================================================
