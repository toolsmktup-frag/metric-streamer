-- ============================================================================
-- Fase 1A — Números corretos: contar PEDIDOS, não linhas (order bump/upsell)
-- ============================================================================
-- Problema: order bump/upsell viram linhas separadas em customer_purchases.
-- Métricas que faziam COUNT(*) tratavam 1 checkout com N itens como N compras,
-- inflando a "frequência"/recompra. Diagnóstico (2026-06-11): a taxa de recompra
-- aparente era 31,1%; contando por pedido (platform_order_id) é 14,7%
-- (5.950 clientes eram falsos recompradores).
--
-- Chave do pedido: COALESCE(platform || ':' || platform_order_id, 'row:' || id)
--   -> linhas sem platform_order_id (~7%) contam como 1 pedido cada (fallback seguro).
--
-- Escopo: corrige a CONTAGEM de pedidos. Receita (SUM) e LTV (fn_cohort_analysis)
-- não mudam — somar dinheiro independe de agrupar pedido. fn_product_prices conta
-- vendas por produto (não inflada por order bump) e fica como está.
-- Tudo additive/reversível (CREATE OR REPLACE).
-- ============================================================================

-- ── 1) Trigger update_customer_metrics: total_orders = pedidos distintos ────
CREATE OR REPLACE FUNCTION public.update_customer_metrics()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
  BEGIN
    IF NEW.unified_customer_id IS NOT NULL AND NEW.status = 'authorized' THEN
      UPDATE public.unified_customers
      SET
        total_spent       = (SELECT COALESCE(SUM(gross_amount), 0) FROM public.customer_purchases WHERE unified_customer_id = NEW.unified_customer_id AND status = 'authorized'),
        -- pedidos distintos (não linhas): order bump/upsell do mesmo checkout contam como 1
        total_orders      = (SELECT COUNT(DISTINCT COALESCE(platform || ':' || platform_order_id, 'row:' || id::text)) FROM public.customer_purchases WHERE unified_customer_id = NEW.unified_customer_id AND status = 'authorized'),
        first_purchase_at = (SELECT MIN(purchased_at) FROM public.customer_purchases WHERE unified_customer_id = NEW.unified_customer_id AND status = 'authorized'),
        last_purchase_at  = (SELECT MAX(purchased_at) FROM public.customer_purchases WHERE unified_customer_id = NEW.unified_customer_id AND status = 'authorized'),
        updated_at        = now()
      WHERE id = NEW.unified_customer_id;
    END IF;
    RETURN NEW;
  END;
  $function$;

-- ── 2) Backfill: recalcular total_orders dos clientes existentes ────────────
UPDATE public.unified_customers uc
SET total_orders = sub.orders,
    updated_at   = now()
FROM (
  SELECT unified_customer_id,
         COUNT(DISTINCT COALESCE(platform || ':' || platform_order_id, 'row:' || id::text)) AS orders
  FROM public.customer_purchases
  WHERE status = 'authorized' AND unified_customer_id IS NOT NULL
  GROUP BY unified_customer_id
) sub
WHERE uc.id = sub.unified_customer_id
  AND uc.total_orders IS DISTINCT FROM sub.orders;

-- ── 3) fn_rfm_customers: purchase_count = pedidos distintos ─────────────────
-- (receita continua sendo a soma de TODAS as linhas — total gasto não muda)
CREATE OR REPLACE FUNCTION public.fn_rfm_customers()
 RETURNS TABLE(customer_id text, email text, name text, total_revenue numeric, purchase_count bigint, last_purchase_at timestamp with time zone, first_purchase_at timestamp with time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
WITH all_purchases AS (

  -- ── Guru + Ticto importado (customer_purchases é fonte unificada) ─
  SELECT
    cp.unified_customer_id::text   AS customer_id,
    cil.identifier_value           AS email,
    NULL::text                     AS name,
    cp.gross_amount::numeric       AS amount,
    cp.purchased_at::timestamptz   AS purchased_at,
    -- chave do pedido: agrupa order bump/upsell do mesmo checkout
    COALESCE(cp.platform || ':' || cp.platform_order_id, 'cp:' || cp.id::text) AS order_key
  FROM public.customer_purchases cp
  LEFT JOIN public.customer_identity_links cil
    ON  cil.unified_customer_id = cp.unified_customer_id
    AND cil.identifier_type     = 'email'
  WHERE cp.status               = 'authorized'
    AND cp.unified_customer_id IS NOT NULL
    AND cp.gross_amount         > 0

  UNION ALL

  -- ── Ticto bruto: SOMENTE transações ainda não importadas ──────────
  SELECT
    COALESCE(
      cil.unified_customer_id::text,
      'email:' || LOWER(TRIM(tt.customer_email))
    )                                   AS customer_id,
    LOWER(TRIM(tt.customer_email))      AS email,
    tt.customer_name                    AS name,
    (tt.paid_amount::numeric / 100.0)   AS amount,
    tt.order_date::timestamptz          AS purchased_at,
    'ticto:' || tt.order_id::text       AS order_key
  FROM public.ticto_transactions tt
  LEFT JOIN public.customer_identity_links cil
    ON  LOWER(TRIM(cil.identifier_value)) = LOWER(TRIM(tt.customer_email))
    AND cil.identifier_type               = 'email'
  WHERE tt.status        = 'authorized'
    AND tt.customer_email IS NOT NULL
    AND tt.customer_email <> ''
    AND tt.paid_amount    > 0
    AND NOT EXISTS (
      SELECT 1
      FROM public.customer_purchases cp_exists
      WHERE cp_exists.platform          = 'ticto'
        AND cp_exists.platform_order_id = tt.order_id::text
    )

),

-- Melhor email/nome por customer_id (prioriza não-nulo)
customer_meta AS (
  SELECT
    customer_id,
    MIN(email) FILTER (WHERE email IS NOT NULL AND email <> '') AS email,
    MAX(name)  FILTER (WHERE name  IS NOT NULL AND name  <> '') AS name
  FROM all_purchases
  GROUP BY customer_id
),

-- Fallback de nome: busca identifier_type='name' para clientes sem nome
name_fallback AS (
  SELECT
    unified_customer_id::text                              AS customer_id,
    MAX(identifier_value)                                  AS alt_name
  FROM public.customer_identity_links
  WHERE identifier_type = 'name'
  GROUP BY unified_customer_id
)

SELECT
  ap.customer_id,
  cm.email,
  COALESCE(cm.name, nf.alt_name)        AS name,
  SUM(ap.amount)::numeric                AS total_revenue,
  COUNT(DISTINCT ap.order_key)::bigint   AS purchase_count,  -- pedidos, não linhas
  MAX(ap.purchased_at)                   AS last_purchase_at,
  MIN(ap.purchased_at)                   AS first_purchase_at
FROM all_purchases ap
JOIN customer_meta cm    ON cm.customer_id = ap.customer_id
LEFT JOIN name_fallback nf ON nf.customer_id = ap.customer_id
GROUP BY ap.customer_id, cm.email, COALESCE(cm.name, nf.alt_name);
$function$;
