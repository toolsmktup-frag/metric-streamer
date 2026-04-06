-- ═══════════════════════════════════════════════════════════════════
-- BACKFILL: Corrigir transações Ticto do funil "Guia de Tinturas"
-- Normaliza status, preenche paid_amount, product_name, order_date
-- a partir do raw_payload. NÃO converte abandono real em venda.
--
-- Rodar no SQL Editor do Supabase Dashboard
-- ═══════════════════════════════════════════════════════════════════

-- ─── 1. DIAGNÓSTICO: ver status brutos no webhook_audit ───
-- (rode primeiro para entender o que a Ticto está mandando)

SELECT raw_status, normalized_status, COUNT(*) AS qty
FROM webhook_audit
WHERE source = 'ticto'
  AND funnel_id = '10000000-0000-0000-0000-000000000001'
GROUP BY raw_status, normalized_status
ORDER BY qty DESC;

-- ─── 2. DIAGNÓSTICO: ver transações com dados faltantes ───

SELECT id, order_id, status, paid_amount, product_name, order_date,
  raw_payload->>'status' AS raw_status_root,
  raw_payload->'data'->'invoice'->>'status' AS raw_status_invoice,
  raw_payload->'data'->'invoice'->>'paid_amount' AS raw_amount_invoice,
  raw_payload->'data'->'invoice'->>'product_name' AS raw_product_invoice,
  raw_payload->'data'->'invoice'->>'created_at' AS raw_date_invoice
FROM ticto_transactions
WHERE funnel_id = '10000000-0000-0000-0000-000000000001'
ORDER BY COALESCE(order_date, updated_at) DESC NULLS LAST
LIMIT 30;

-- ─── 3. BACKFILL: normalizar status ───
-- Mapeia status brutos que não eram reconhecidos pelo webhook antigo

UPDATE ticto_transactions
SET
  status = CASE
    WHEN LOWER(COALESCE(
      raw_payload->>'status',
      raw_payload->'data'->'invoice'->>'status',
      raw_payload->'data'->>'status',
      raw_payload->'order'->>'status',
      ''
    )) IN ('approved', 'authorized', 'paid', 'sale_approved', 'sale_completed', 'completed', 'purchase_approved', 'purchase_complete', 'transaction_approved')
    THEN 'authorized'

    WHEN LOWER(COALESCE(
      raw_payload->>'status',
      raw_payload->'data'->'invoice'->>'status',
      raw_payload->'data'->>'status',
      ''
    )) IN ('pix_created', 'pending', 'waiting_payment', 'bank_slip_created', 'bank_slip_delayed')
    THEN 'pending'

    WHEN LOWER(COALESCE(
      raw_payload->>'status',
      raw_payload->'data'->'invoice'->>'status',
      raw_payload->'data'->>'status',
      ''
    )) IN ('abandoned_cart', 'cart_abandoned', 'abandoned')
    THEN 'abandoned_cart'

    ELSE status
  END,
  updated_at = NOW()
WHERE funnel_id = '10000000-0000-0000-0000-000000000001'
  AND status NOT IN ('authorized', 'refunded', 'chargeback');

-- ─── 4. BACKFILL: preencher paid_amount zerado ───

UPDATE ticto_transactions
SET
  paid_amount = COALESCE(
    NULLIF((raw_payload->'data'->'invoice'->>'paid_amount')::numeric, 0),
    NULLIF((raw_payload->'data'->'invoice'->>'amount')::numeric, 0),
    NULLIF((raw_payload->'data'->'invoice'->>'total')::numeric, 0),
    NULLIF((raw_payload->'data'->'invoice'->>'value')::numeric, 0),
    NULLIF((raw_payload->'order'->>'paid_amount')::numeric, 0),
    NULLIF((raw_payload->'order'->>'amount')::numeric, 0),
    NULLIF((raw_payload->>'paid_amount')::numeric, 0),
    NULLIF((raw_payload->>'amount')::numeric, 0),
    NULLIF((raw_payload->'item'->>'amount')::numeric, 0),
    NULLIF((raw_payload->'item'->>'total_value')::numeric, 0),
    NULLIF((raw_payload->'item'->>'unit_value')::numeric, 0),
    NULLIF((raw_payload->'payment'->>'amount')::numeric, 0),
    paid_amount
  ),
  updated_at = NOW()
WHERE funnel_id = '10000000-0000-0000-0000-000000000001'
  AND (paid_amount = 0 OR paid_amount IS NULL)
  AND status = 'authorized';

-- ─── 5. BACKFILL: preencher product_name vazio ───

UPDATE ticto_transactions
SET
  product_name = COALESCE(
    NULLIF(raw_payload->'item'->>'product_name', ''),
    NULLIF(raw_payload->'item'->>'name', ''),
    NULLIF(raw_payload->'item'->'product'->>'name', ''),
    NULLIF(raw_payload->'data'->'invoice'->>'product_name', ''),
    NULLIF(raw_payload->'data'->'invoice'->'product'->>'name', ''),
    NULLIF(raw_payload->'product'->>'name', ''),
    NULLIF(raw_payload->>'product_name', ''),
    product_name
  ),
  updated_at = NOW()
WHERE funnel_id = '10000000-0000-0000-0000-000000000001'
  AND (product_name IS NULL OR product_name = '');

-- ─── 6. BACKFILL: preencher order_date nulo ───

UPDATE ticto_transactions
SET
  order_date = COALESCE(
    (raw_payload->'order'->>'order_date')::timestamptz,
    (raw_payload->'data'->'invoice'->>'created_at')::timestamptz,
    (raw_payload->'data'->'invoice'->>'order_date')::timestamptz,
    (raw_payload->'dates'->>'confirmed_at')::timestamptz,
    (raw_payload->'dates'->>'created_at')::timestamptz,
    (raw_payload->>'status_date')::timestamptz,
    (raw_payload->'contract'->>'createdAt')::timestamptz,
    order_date
  ),
  updated_at = NOW()
WHERE funnel_id = '10000000-0000-0000-0000-000000000001'
  AND order_date IS NULL;

-- ─── 7. VERIFICAÇÃO FINAL ───

SELECT status, COUNT(*) AS qty, SUM(paid_amount) AS total_cents
FROM ticto_transactions
WHERE funnel_id = '10000000-0000-0000-0000-000000000001'
GROUP BY status
ORDER BY qty DESC;
