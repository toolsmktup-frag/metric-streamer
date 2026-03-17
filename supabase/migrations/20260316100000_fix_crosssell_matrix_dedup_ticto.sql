-- ═══════════════════════════════════════════════════════════════════
-- FIX: fn_crosssell_matrix() — remove dupla contagem Ticto
--
-- Problema: UNION ALL de customer_purchases + ticto_transactions sem dedup.
-- Clientes Ticto sem identity link resolvida ficavam com customer_id
-- diferente nas duas fontes (UUID vs 'email:...'), inflando buyers_of_a.
--
-- Observação: a CTE customer_products já usa DISTINCT (customer_id, product_name),
-- então se ambas as fontes resolvem para o mesmo customer_id o impacto é zero.
-- Mas quando o identity link não resolve, o mesmo comprador é contado 2x.
--
-- Correção: aplicar NOT EXISTS no branch Ticto (mesmo padrão de fn_rfm_customers).
--
-- ROLLBACK: DROP FUNCTION public.fn_crosssell_matrix();
--           + reexecutar 20260316040000_crosssell_matrix_fn.sql
-- ═══════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.fn_crosssell_matrix()
RETURNS TABLE(
  product_a       text,
  product_b       text,
  buyers_both     bigint,
  buyers_of_a     bigint,
  cross_sell_pct  numeric
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH all_purchases AS (

    -- Guru + Eduzz + Ticto importado (customer_purchases é fonte unificada)
    SELECT
      unified_customer_id::text AS customer_id,
      product_name
    FROM public.customer_purchases
    WHERE status = 'authorized'
      AND unified_customer_id IS NOT NULL
      AND product_name IS NOT NULL

    UNION ALL

    -- Ticto bruto: SOMENTE transações ainda não importadas em customer_purchases
    SELECT
      COALESCE(
        cil.unified_customer_id::text,
        'email:' || LOWER(TRIM(tt.customer_email))
      ) AS customer_id,
      tt.product_name
    FROM public.ticto_transactions tt
    LEFT JOIN public.customer_identity_links cil
      ON  LOWER(TRIM(cil.identifier_value)) = LOWER(TRIM(tt.customer_email))
      AND cil.identifier_type = 'email'
    WHERE tt.status = 'authorized'
      AND tt.product_name IS NOT NULL
      -- Exclui transações já presentes em customer_purchases
      AND NOT EXISTS (
        SELECT 1
        FROM public.customer_purchases cp_exists
        WHERE cp_exists.platform          = 'ticto'
          AND cp_exists.platform_order_id = tt.order_id::text
      )
  ),

  -- Um registro por (cliente, produto) — elimina duplicatas residuais
  customer_products AS (
    SELECT DISTINCT customer_id, product_name
    FROM all_purchases
  ),

  -- Total de compradores únicos por produto
  product_totals AS (
    SELECT product_name, COUNT(DISTINCT customer_id) AS total_buyers
    FROM customer_products
    GROUP BY product_name
  ),

  -- Pares: clientes que compraram produto A E produto B
  pairs AS (
    SELECT
      a.product_name AS product_a,
      b.product_name AS product_b,
      COUNT(DISTINCT a.customer_id) AS buyers_both
    FROM customer_products a
    JOIN customer_products b
      ON  a.customer_id  = b.customer_id
      AND a.product_name <> b.product_name
    GROUP BY a.product_name, b.product_name
  )

  SELECT
    p.product_a,
    p.product_b,
    p.buyers_both,
    pt.total_buyers AS buyers_of_a,
    ROUND((p.buyers_both::numeric / NULLIF(pt.total_buyers, 0) * 100), 1) AS cross_sell_pct
  FROM pairs p
  JOIN product_totals pt ON pt.product_name = p.product_a
  WHERE pt.total_buyers >= 5
  ORDER BY p.product_a, cross_sell_pct DESC;
$$;

COMMENT ON FUNCTION public.fn_crosssell_matrix() IS
  'Matriz de cross-sell entre produtos (Guru + Ticto). '
  'customer_purchases é fonte principal. ticto_transactions complementa apenas '
  'transações não importadas (NOT EXISTS). DISTINCT garante 1 linha por (cliente, produto).';

GRANT EXECUTE ON FUNCTION public.fn_crosssell_matrix() TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_crosssell_matrix() TO service_role;
