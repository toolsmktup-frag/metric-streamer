-- ═══════════════════════════════════════════════════════════════════
-- FIX: Vendas Guru sumindo do Resumo / KPI / Campanhas do funil
--
-- DIAGNÓSTICO:
-- - A FK customer_purchases.funnel_id → funnels(id) (CRM antigo)
-- - O webhook Guru resolve funnel_id via lead_funnels (CRM novo)
-- - IDs não batem → FK violation → forçamos remover funnel_id do insert
-- - Resultado: vendas Guru de hoje ficaram com funnel_id = NULL
-- - View v_all_sales lê funnel_id direto → tela do funil retorna 0 vendas
--
-- SOLUÇÃO:
-- 1) Dropar a FK rígida (mantém coluna e índice)
-- 2) Backfill das vendas órfãs de hoje via product_name → resolve_funnel_id
-- 3) Re-deploy do edge function guru-webhook (já corrigido) para voltar
--    a gravar funnel_id em novas vendas
--
-- RODAR NO SQL EDITOR DO SUPABASE DASHBOARD:
-- https://supabase.com/dashboard/project/emfbocpmphtftqcezaib/sql
-- ═══════════════════════════════════════════════════════════════════

-- 1. Drop FK problemática (aponta para a tabela errada)
ALTER TABLE public.customer_purchases
  DROP CONSTRAINT IF EXISTS customer_purchases_funnel_id_fkey;

-- 2. Backfill das vendas Guru órfãs (funnel_id NULL)
--    Usa resolve_funnel_id por product_name
WITH backfilled AS (
  UPDATE public.customer_purchases cp
  SET funnel_id = public.resolve_funnel_id(cp.product_name)
  WHERE cp.platform = 'guru'
    AND cp.funnel_id IS NULL
    AND cp.product_name IS NOT NULL
    AND cp.product_name <> ''
    AND public.resolve_funnel_id(cp.product_name) IS NOT NULL
  RETURNING id, product_name, funnel_id
)
SELECT
  COUNT(*)                       AS vendas_corrigidas,
  COUNT(DISTINCT funnel_id)      AS funis_atingidos,
  COUNT(DISTINCT product_name)   AS produtos_distintos
FROM backfilled;

-- 3. Diagnóstico — vendas Guru ainda órfãs (não mapeadas a nenhum funil)
SELECT
  product_name,
  COUNT(*) AS vendas_orfas,
  MIN(purchased_at) AS primeira,
  MAX(purchased_at) AS ultima
FROM public.customer_purchases
WHERE platform = 'guru'
  AND funnel_id IS NULL
  AND purchased_at >= NOW() - INTERVAL '7 days'
GROUP BY product_name
ORDER BY vendas_orfas DESC;

-- 4. Conferir resultado: vendas hoje no Articulabem
SELECT
  funnel_id,
  COUNT(*) AS total,
  SUM(gross_amount) AS receita,
  array_agg(DISTINCT product_name) AS produtos
FROM public.customer_purchases
WHERE platform = 'guru'
  AND purchased_at >= CURRENT_DATE
GROUP BY funnel_id
ORDER BY total DESC;
