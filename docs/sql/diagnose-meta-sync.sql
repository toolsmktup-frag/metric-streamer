-- ═══════════════════════════════════════════════════════════════════
-- DIAGNÓSTICO: Por que os gastos do Meta não aparecem hoje?
-- Rodar no SQL Editor do Supabase
-- ═══════════════════════════════════════════════════════════════════

-- 1) Quando foi a última sincronização? Deu erro?
SELECT
  id,
  status,
  started_at AT TIME ZONE 'America/Sao_Paulo' AS iniciou,
  finished_at AT TIME ZONE 'America/Sao_Paulo' AS terminou,
  records_synced,
  error
FROM public.meta_sync_log
ORDER BY started_at DESC
LIMIT 10;

-- 2) Qual a data mais recente que existe na tabela meta_insights?
SELECT
  object_type,
  MAX(date_start) AS data_mais_recente,
  COUNT(*) FILTER (WHERE date_start = CURRENT_DATE)        AS linhas_hoje,
  COUNT(*) FILTER (WHERE date_start = CURRENT_DATE - 1)    AS linhas_ontem,
  SUM(spend) FILTER (WHERE date_start = CURRENT_DATE)      AS gasto_hoje,
  SUM(spend) FILTER (WHERE date_start = CURRENT_DATE - 1)  AS gasto_ontem
FROM public.meta_insights
GROUP BY object_type;

-- 3) Os funis têm meta_account_id configurado?
SELECT id, name, meta_account_id
FROM public.funnels
WHERE meta_account_id IS NOT NULL
ORDER BY name;

-- 4) Quantas campanhas/adsets/ads existem por conta?
SELECT 'campaigns' AS tipo, account_id, COUNT(*) FROM public.meta_campaigns GROUP BY account_id
UNION ALL
SELECT 'adsets', NULL, COUNT(*) FROM public.meta_adsets
UNION ALL
SELECT 'ads', NULL, COUNT(*) FROM public.meta_ads;
