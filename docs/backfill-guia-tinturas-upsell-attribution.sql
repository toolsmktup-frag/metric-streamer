-- ═══════════════════════════════════════════════════════════════════
-- BACKFILL: Atribuição de upsells órfãos do funil "Guia de Tinturas"
--
-- Problema: vendas do upsell "Curso Mestre das Tinturas" (e outros
-- upsells) ficaram sem meta_campaign_id / funnel_id, então não
-- aparecem na tela de Campanhas — apenas no resumo do funil.
--
-- Estratégia: para cada transação autorizada SEM meta_campaign_id,
-- procurar a venda principal mais recente (até 30 dias) do mesmo
-- cliente (email ou telefone) que TENHA meta_campaign_id, e herdar:
--   - meta_campaign_id / meta_adset_id / meta_ad_id
--   - funnel_id
--   - utm_* (se vazios)
--   - fbc / fbp / fbclid / gclid (se vazios)
--
-- Rodar no SQL Editor do Supabase Dashboard.
-- ═══════════════════════════════════════════════════════════════════

-- ─── 1. DIAGNÓSTICO: quantos upsells estão órfãos? ───
SELECT
  COUNT(*) FILTER (WHERE meta_campaign_id IS NULL) AS sem_campaign,
  COUNT(*) FILTER (WHERE funnel_id IS NULL)        AS sem_funnel,
  COUNT(*)                                          AS total
FROM ticto_transactions
WHERE status = 'authorized'
  AND order_date >= NOW() - INTERVAL '30 days'
  AND product_name ILIKE '%mestre%das%tintura%';

-- ─── 2. PREVIEW: quais transações receberiam herança? ───
WITH orfas AS (
  SELECT id, customer_email, customer_phone, product_name, order_date, paid_amount
  FROM ticto_transactions
  WHERE status = 'authorized'
    AND meta_campaign_id IS NULL
    AND order_date >= NOW() - INTERVAL '30 days'
),
doadoras AS (
  SELECT DISTINCT ON (o.id)
    o.id                       AS orfa_id,
    o.product_name             AS orfa_product,
    o.order_date               AS orfa_date,
    d.id                       AS doadora_id,
    d.product_name             AS doadora_product,
    d.meta_campaign_id,
    d.funnel_id,
    d.utm_source
  FROM orfas o
  LEFT JOIN ticto_transactions d
    ON d.status = 'authorized'
   AND d.meta_campaign_id IS NOT NULL
   AND d.order_date >= NOW() - INTERVAL '60 days'
   AND d.order_date <= o.order_date + INTERVAL '1 day'
   AND (
     (o.customer_email IS NOT NULL AND LOWER(d.customer_email) = LOWER(o.customer_email))
     OR (
       o.customer_phone IS NOT NULL
       AND length(regexp_replace(o.customer_phone, '\D', '', 'g')) >= 10
       AND right(regexp_replace(d.customer_phone, '\D', '', 'g'), 10)
         = right(regexp_replace(o.customer_phone, '\D', '', 'g'), 10)
     )
   )
  ORDER BY o.id, d.order_date DESC
)
SELECT * FROM doadoras
WHERE doadora_id IS NOT NULL
ORDER BY orfa_date DESC
LIMIT 50;

-- ─── 3. BACKFILL: aplicar a herança ───
WITH orfas AS (
  SELECT id, customer_email, customer_phone, order_date,
         utm_source, utm_campaign, utm_medium, utm_content, utm_term,
         fbc, fbp, fbclid, gclid
  FROM ticto_transactions
  WHERE status = 'authorized'
    AND meta_campaign_id IS NULL
    AND order_date >= NOW() - INTERVAL '60 days'
),
doadoras AS (
  SELECT DISTINCT ON (o.id)
    o.id AS orfa_id,
    d.meta_campaign_id, d.meta_adset_id, d.meta_ad_id,
    d.funnel_id,
    d.utm_source AS d_utm_source, d.utm_campaign AS d_utm_campaign,
    d.utm_medium AS d_utm_medium, d.utm_content AS d_utm_content,
    d.utm_term AS d_utm_term,
    d.fbc AS d_fbc, d.fbp AS d_fbp,
    d.fbclid AS d_fbclid, d.gclid AS d_gclid,
    d.is_paid_traffic AS d_is_paid_traffic
  FROM orfas o
  JOIN ticto_transactions d
    ON d.status = 'authorized'
   AND d.meta_campaign_id IS NOT NULL
   AND d.order_date >= NOW() - INTERVAL '90 days'
   AND d.order_date <= o.order_date + INTERVAL '1 day'
   AND (
     (o.customer_email IS NOT NULL AND LOWER(d.customer_email) = LOWER(o.customer_email))
     OR (
       o.customer_phone IS NOT NULL
       AND length(regexp_replace(o.customer_phone, '\D', '', 'g')) >= 10
       AND right(regexp_replace(d.customer_phone, '\D', '', 'g'), 10)
         = right(regexp_replace(o.customer_phone, '\D', '', 'g'), 10)
     )
   )
  ORDER BY o.id, d.order_date DESC
)
UPDATE ticto_transactions t
SET
  meta_campaign_id = d.meta_campaign_id,
  meta_adset_id    = COALESCE(t.meta_adset_id, d.meta_adset_id),
  meta_ad_id       = COALESCE(t.meta_ad_id,    d.meta_ad_id),
  funnel_id        = COALESCE(t.funnel_id,     d.funnel_id),
  utm_source       = COALESCE(t.utm_source,    d.d_utm_source),
  utm_campaign     = COALESCE(t.utm_campaign,  d.d_utm_campaign),
  utm_medium       = COALESCE(t.utm_medium,    d.d_utm_medium),
  utm_content      = COALESCE(t.utm_content,   d.d_utm_content),
  utm_term         = COALESCE(t.utm_term,      d.d_utm_term),
  fbc              = COALESCE(t.fbc,           d.d_fbc),
  fbp              = COALESCE(t.fbp,           d.d_fbp),
  fbclid           = COALESCE(t.fbclid,        d.d_fbclid),
  gclid            = COALESCE(t.gclid,         d.d_gclid),
  is_paid_traffic  = COALESCE(t.is_paid_traffic, d.d_is_paid_traffic),
  updated_at       = NOW()
FROM doadoras d
WHERE t.id = d.orfa_id;

-- ─── 4. VERIFICAÇÃO: quantos upsells "Mestre das Tinturas" foram corrigidos? ───
SELECT
  COUNT(*) FILTER (WHERE meta_campaign_id IS NOT NULL) AS com_campaign,
  COUNT(*) FILTER (WHERE meta_campaign_id IS NULL)     AS ainda_sem,
  COUNT(*) FILTER (WHERE funnel_id IS NOT NULL)        AS com_funnel,
  COUNT(*)                                              AS total,
  SUM(paid_amount) FILTER (WHERE meta_campaign_id IS NOT NULL) AS receita_atribuida_cents
FROM ticto_transactions
WHERE status = 'authorized'
  AND order_date >= NOW() - INTERVAL '30 days'
  AND product_name ILIKE '%mestre%das%tintura%';

-- ─── 5. VERIFICAÇÃO: receita por campanha do funil Guia de Tinturas (30d) ───
SELECT
  meta_campaign_id,
  COUNT(*) AS vendas,
  SUM(paid_amount) / 100.0 AS receita_brl
FROM ticto_transactions
WHERE status = 'authorized'
  AND funnel_id = '10000000-0000-0000-0000-000000000001'
  AND order_date >= NOW() - INTERVAL '30 days'
GROUP BY meta_campaign_id
ORDER BY receita_brl DESC;
