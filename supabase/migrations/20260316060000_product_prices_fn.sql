-- ─────────────────────────────────────────────────────────────────
-- fn_product_prices()
-- Retorna preço de tabela real por produto (usa MODA — preço mais frequente)
-- Mantém variantes separadas (ex: 1, 3, 6 potes Articulabem)
-- ─────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION fn_product_prices()
RETURNS TABLE(
  produto_original  text,
  produto_canonico  text,
  categoria         text,
  preco_tabela      numeric,
  total_vendas      bigint
)
LANGUAGE sql
STABLE
AS $$
  SELECT
    cp.product_name                                       AS produto_original,
    fn_normalize_product(cp.product_name)                AS produto_canonico,
    COALESCE(pc.category, 'outros')                      AS categoria,
    MODE() WITHIN GROUP (ORDER BY cp.gross_amount)       AS preco_tabela,
    COUNT(*)                                             AS total_vendas
  FROM customer_purchases cp
  LEFT JOIN product_catalog pc
    ON pc.canonical_name = fn_normalize_product(cp.product_name)
  WHERE cp.status = 'authorized'
    AND cp.gross_amount > 1
    AND cp.product_name IS NOT NULL
  GROUP BY cp.product_name, fn_normalize_product(cp.product_name), COALESCE(pc.category, 'outros')
  HAVING COUNT(*) >= 2
  ORDER BY categoria, produto_canonico, preco_tabela DESC;
$$;
