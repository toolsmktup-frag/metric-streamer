-- ────────────────────────────────────────────────────────────────────
-- fn_crosssell_matrix()
-- Calcula % de compradores de cada produto que também compraram outros
-- Usa: customer_purchases (Guru/Eduzz) + ticto_transactions (via email)
-- ────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION fn_crosssell_matrix()
RETURNS TABLE(
  product_a       text,
  product_b       text,
  buyers_both     bigint,
  buyers_of_a     bigint,
  cross_sell_pct  numeric
)
LANGUAGE sql
STABLE
AS $$
  WITH all_purchases AS (
    -- Guru + Eduzz (unified_customer_id já resolvido)
    SELECT
      unified_customer_id::text AS customer_id,
      product_name
    FROM customer_purchases
    WHERE status = 'authorized'
      AND unified_customer_id IS NOT NULL
      AND product_name IS NOT NULL

    UNION ALL

    -- Ticto: resolve email → unified_customer_id via customer_identity_links
    SELECT
      COALESCE(
        cil.unified_customer_id::text,
        'email:' || LOWER(TRIM(tt.customer_email))
      ) AS customer_id,
      tt.product_name
    FROM ticto_transactions tt
    LEFT JOIN customer_identity_links cil
      ON cil.identifier_value = LOWER(TRIM(tt.customer_email))
      AND cil.identifier_type = 'email'
    WHERE tt.status = 'authorized'
      AND tt.product_name IS NOT NULL
  ),

  -- Um registro por (cliente, produto) — elimina duplicatas
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
      ON a.customer_id = b.customer_id
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
  WHERE pt.total_buyers >= 5  -- ignora produtos com pouquíssimos compradores
  ORDER BY p.product_a, cross_sell_pct DESC;
$$;
