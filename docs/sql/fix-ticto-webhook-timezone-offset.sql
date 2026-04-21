-- ═══════════════════════════════════════════════════════════════════
-- FIX: Ticto webhook timezone offset (BRT -> UTC)
-- Rodar no SQL Editor do Supabase Dashboard
-- ═══════════════════════════════════════════════════════════════════
-- PROBLEMA:
-- A Ticto envia datas no formato "YYYY-MM-DD HH:mm:ss" SEM timezone,
-- representando o horário local de Brasília (BRT, UTC-3). O webhook
-- antigo interpretava esse valor como UTC.
--
-- Exemplo real:
--   payload.order.order_date = "2026-04-21 01:10:54"
--   gravado errado         -> 2026-04-21T01:10:54Z
--   instante correto       -> 2026-04-21T04:10:54Z
--
-- Ou seja: os registros antigos ficaram 3h ATRASADOS em UTC.
--
-- SINTOMA:
-- Vendas entre 00:00 e 02:59 BRT passavam a cair no dia local anterior
-- e sumiam das telas que filtram por timezone local:
--   - Resumo Geral
--   - Resumo do Funil
--   - Campanhas
-- (todas usam v_all_sales -> useAllSales -> dayStartISO/dayEndISO com
-- offset -03:00).
-- Continuavam aparecendo na KPI do funil (que filtra sem TZ).
--
-- CORREÇÃO:
-- O ajuste correto é SOMAR 3h nos registros originais do webhook.
--
-- IMPORTANTE:
-- Se você JÁ executou a versão anterior deste script (que SUBTRAÍA 3h),
-- então agora precisa SOMAR 6h para compensar o ajuste errado e chegar
-- no horário correto final.
--
-- Importações via CSV (ingestion_type='import') NÃO são afetadas.
--
-- ═══════════════════════════════════════════════════════════════════

-- 1. Conferir o impacto antes de aplicar (opcional)
-- SELECT count(*) FROM public.ticto_transactions WHERE ingestion_type = 'webhook';

-- 2A. Aplicar se você AINDA NÃO rodou a versão antiga deste script
-- UPDATE public.ticto_transactions
-- SET
--   order_date  = order_date  + INTERVAL '3 hours',
--   status_date = CASE
--                   WHEN status_date IS NOT NULL
--                   THEN status_date + INTERVAL '3 hours'
--                   ELSE NULL
--                 END,
--   updated_at  = now()
-- WHERE ingestion_type = 'webhook';

-- 2B. Aplicar se você JÁ rodou a versão antiga que SUBTRAÍA 3h
UPDATE public.ticto_transactions
SET
  order_date  = order_date  + INTERVAL '6 hours',
  status_date = CASE
                  WHEN status_date IS NOT NULL
                  THEN status_date + INTERVAL '6 hours'
                  ELSE NULL
                END,
  updated_at  = now()
WHERE ingestion_type = 'webhook';

-- 3. Verificar a venda do exemplo
-- SELECT id, order_id, transaction_hash, order_date, status_date,
--        meta_campaign_id, meta_adset_id, meta_ad_id, paid_amount
-- FROM public.ticto_transactions
-- WHERE transaction_hash = 'TPC10238A21048VR753JE';
