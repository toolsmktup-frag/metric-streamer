-- ─────────────────────────────────────────────────────────────────
-- Corrige fn_normalize_product para tratar nomes com encoding corrompido
-- Usa ILIKE como fallback para pegar variantes com caracteres quebrados
-- ─────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION fn_normalize_product(product_name text)
RETURNS text
LANGUAGE sql
STABLE
AS $$
  SELECT COALESCE(
    -- 1. Busca exata no alias
    (SELECT canonical_name FROM product_name_aliases WHERE alias = product_name),
    -- 2. Fallback ILIKE para encoding corrompido (ex: Gr▯tis, PROMO▯▯O)
    (SELECT canonical_name FROM product_name_aliases
     WHERE product_name ILIKE '%' || SUBSTRING(alias, 1, 20) || '%'
       AND LENGTH(alias) BETWEEN LENGTH(product_name) - 5 AND LENGTH(product_name) + 5
     LIMIT 1),
    -- 3. Mantém nome original se não achar alias
    product_name
  );
$$;
