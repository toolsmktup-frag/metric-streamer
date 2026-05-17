-- ════════════════════════════════════════════════════════════════
-- FIX: resolve_funnel_id agora prioriza product_id sobre name ILIKE
-- + Backfill das vendas órfãs com product_id já mapeado
-- Rodar no SQL Editor do Supabase Dashboard
-- ════════════════════════════════════════════════════════════════

-- 1) Função nova: aceita product_id opcional, prioriza match exato por ID
CREATE OR REPLACE FUNCTION public.resolve_funnel_id(
  p_product_name text,
  p_product_id   text DEFAULT NULL
)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT fp.funnel_id
  FROM public.funnel_products fp
  JOIN public.funnels f ON f.id = fp.funnel_id
  WHERE f.is_active = true
    AND (
      (p_product_id IS NOT NULL AND p_product_id <> '' AND fp.product_id::text = p_product_id)
      OR (
        fp.product_name_contains IS NOT NULL
        AND p_product_name IS NOT NULL
        AND p_product_name ILIKE '%' || fp.product_name_contains || '%'
      )
    )
  ORDER BY
    CASE WHEN p_product_id IS NOT NULL AND p_product_id <> ''
              AND fp.product_id::text = p_product_id
         THEN 0 ELSE 1 END,
    length(coalesce(fp.product_name_contains, '')) DESC
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.resolve_funnel_id(text, text) TO authenticated, service_role, anon;

-- 2) Backfill: vendas Guru órfãs cujo product_id já está em funnel_products
UPDATE public.customer_purchases cp
SET funnel_id = fp.funnel_id
FROM public.funnel_products fp
JOIN public.funnels f ON f.id = fp.funnel_id
WHERE cp.funnel_id IS NULL
  AND cp.product_id IS NOT NULL
  AND fp.product_id::text = cp.product_id
  AND f.is_active = true;

-- 3) Backfill: vendas Ticto órfãs cujo product_id já está em funnel_products
UPDATE public.ticto_transactions tt
SET funnel_id = fp.funnel_id
FROM public.funnel_products fp
JOIN public.funnels f ON f.id = fp.funnel_id
WHERE tt.funnel_id IS NULL
  AND tt.product_id IS NOT NULL
  AND fp.product_id = tt.product_id
  AND f.is_active = true;
