-- ═══════════════════════════════════════════════════════════════════
-- FIX: Ticto webhook timezone offset (BRT -> UTC)
-- Rodar no SQL Editor do Supabase Dashboard
-- ═══════════════════════════════════════════════════════════════════
-- PROBLEMA:
-- A Ticto envia datas no formato "YYYY-MM-DD HH:mm:ss" SEM timezone,
-- representando o horário local de Brasília (BRT, UTC-3). O webhook
-- antigo (safeISO -> new Date().toISOString()) interpretava como UTC,
-- adiantando todas as vendas em 3 horas.
--
-- SINTOMA:
-- Vendas noturnas (entre 21:00 e 00:00 BRT) caíam no dia seguinte em
-- UTC e sumiam das telas que filtram por timezone local:
--   - Resumo Geral
--   - Resumo do Funil
--   - Campanhas
-- (todas usam v_all_sales -> useAllSales -> dayStartISO/dayEndISO com
-- offset -03:00).
-- Continuavam aparecendo na KPI do funil (que filtra sem TZ).
--
-- CORREÇÃO:
-- Subtrai 3h dos registros vindos por webhook. Importações via CSV
-- (ingestion_type='import') NÃO são afetadas.
--
-- ═══════════════════════════════════════════════════════════════════

-- 1. Conferir o impacto antes de aplicar (opcional)
-- SELECT count(*) FROM public.ticto_transactions WHERE ingestion_type = 'webhook';

-- 2. Aplicar a correção
UPDATE public.ticto_transactions
SET
  order_date  = order_date  - INTERVAL '3 hours',
  status_date = CASE
                  WHEN status_date IS NOT NULL
                  THEN status_date - INTERVAL '3 hours'
                  ELSE NULL
                END,
  updated_at  = now()
WHERE ingestion_type = 'webhook';

-- 3. Verificar a venda do exemplo
-- SELECT id, order_id, transaction_hash, order_date, status_date,
--        meta_campaign_id, meta_adset_id, meta_ad_id, paid_amount
-- FROM public.ticto_transactions
-- WHERE transaction_hash = 'TPC10238A21048VR753JE';
