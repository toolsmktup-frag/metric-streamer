-- ═══════════════════════════════════════════════════════════════════
-- FIX: fn_product_prices() — MODE() sem fallback + HAVING >= 2 muito restritivo
--
-- Bug #8: MODE() retorna NULL quando não há preço repetido (todos únicos).
--   Exemplo: produto com preços [100, 110, 120] → nenhuma moda → NULL.
--   Fix: COALESCE com PERCENTILE_CONT(0.5) (mediana) como fallback.
--
-- Bug #12: HAVING COUNT(*) >= 2 exclui produtos com apenas 1 venda.
--   Novo produto lançado recentemente some do dashboard de preços.
--   Fix: HAVING COUNT(*) >= 1.
--
-- ROLLBACK: DROP FUNCTION public.fn_product_prices();
--           + reexecutar 20260316060000_product_prices_fn.sql
-- ═══════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.fn_product_prices()
RETURNS TABLE(
  produto_original  text,
  produto_canonico  text,
  categoria         text,
  preco_tabela      numeric,
  total_vendas      bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    cp.product_name                                           AS produto_original,
    fn_normalize_product(cp.product_name)                    AS produto_canonico,
    COALESCE(pc.category, 'outros')                          AS categoria,
    -- MODE() retorna NULL quando todos os preços são únicos (sem repetição).
    -- Fallback: mediana via PERCENTILE_CONT(0.5) para garantir valor sempre presente.
    COALESCE(
      MODE() WITHIN GROUP (ORDER BY cp.gross_amount),
      PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY cp.gross_amount)
    )::numeric                                               AS preco_tabela,
    COUNT(*)                                                 AS total_vendas
  FROM public.customer_purchases cp
  LEFT JOIN public.product_catalog pc
    ON pc.canonical_name = fn_normalize_product(cp.product_name)
  WHERE cp.status        = 'authorized'
    AND cp.gross_amount  > 1
    AND cp.product_name IS NOT NULL
  GROUP BY cp.product_name, fn_normalize_product(cp.product_name), COALESCE(pc.category, 'outros')
  HAVING COUNT(*) >= 1
  ORDER BY categoria, produto_canonico, preco_tabela DESC;
$$;

COMMENT ON FUNCTION public.fn_product_prices() IS
  'Retorna preço de tabela por produto. MODE() com fallback a mediana. '
  'Inclui produtos com >= 1 venda (antes >= 2, excluía lançamentos novos).';

GRANT EXECUTE ON FUNCTION public.fn_product_prices() TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_product_prices() TO service_role;
