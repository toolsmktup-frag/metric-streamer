-- ═══════════════════════════════════════════════════════════════════
-- BACKFILL: Corrigir transações Ticto do funil "Guia de Tinturas"
-- que entraram com paid_amount=0 e product_name vazio
-- devido ao payload data.invoice não ser parseado.
--
-- Rodar no SQL Editor do Supabase Dashboard
-- ═══════════════════════════════════════════════════════════════════

-- 1) Primeiro, verificar o que será afetado (dry run)
SELECT 
  id,
  order_id,
  status,
  paid_amount,
  product_name,
  -- Tentar extrair dos vários caminhos possíveis no raw_payload
  COALESCE(
    (raw_payload->'data'->'invoice'->>'paid_amount')::numeric,
    (raw_payload->'data'->'invoice'->>'amount')::numeric,
    (raw_payload->'data'->'invoice'->>'total')::numeric,
    (raw_payload->'data'->'invoice'->>'value')::numeric,
    (raw_payload->'data'->>'paid_amount')::numeric,
    (raw_payload->'data'->>'amount')::numeric,
    (raw_payload->>'paid_amount')::numeric,
    (raw_payload->'order'->>'paid_amount')::numeric,
    0
  ) AS extracted_amount,
  COALESCE(
    raw_payload->'data'->'invoice'->>'product_name',
    raw_payload->'data'->'invoice'->'product'->>'name',
    raw_payload->'data'->>'product_name',
    raw_payload->'data'->'product'->>'name',
    raw_payload->>'product_name',
    raw_payload->'product'->>'name',
    raw_payload->'item'->>'product_name',
    ''
  ) AS extracted_product,
  COALESCE(
    raw_payload->'data'->'invoice'->>'status',
    raw_payload->'data'->>'status',
    raw_payload->>'status',
    ''
  ) AS extracted_status
FROM ticto_transactions
WHERE funnel_id = '10000000-0000-0000-0000-000000000001'
  AND (paid_amount = 0 OR paid_amount IS NULL OR product_name IS NULL OR product_name = '')
ORDER BY created_at DESC;

-- 2) Se o resultado acima mostrar valores corretos em extracted_amount/product, 
--    executar o UPDATE abaixo:

UPDATE ticto_transactions t
SET 
  paid_amount = COALESCE(
    NULLIF((raw_payload->'data'->'invoice'->>'paid_amount')::numeric, 0),
    NULLIF((raw_payload->'data'->'invoice'->>'amount')::numeric, 0),
    NULLIF((raw_payload->'data'->'invoice'->>'total')::numeric, 0),
    NULLIF((raw_payload->'data'->'invoice'->>'value')::numeric, 0),
    NULLIF((raw_payload->'data'->>'paid_amount')::numeric, 0),
    NULLIF((raw_payload->'data'->>'amount')::numeric, 0),
    NULLIF((raw_payload->>'paid_amount')::numeric, 0),
    NULLIF((raw_payload->'order'->>'paid_amount')::numeric, 0),
    t.paid_amount
  ),
  product_name = COALESCE(
    NULLIF(raw_payload->'data'->'invoice'->>'product_name', ''),
    NULLIF(raw_payload->'data'->'invoice'->'product'->>'name', ''),
    NULLIF(raw_payload->'data'->>'product_name', ''),
    NULLIF(raw_payload->'data'->'product'->>'name', ''),
    NULLIF(raw_payload->>'product_name', ''),
    NULLIF(raw_payload->'product'->>'name', ''),
    NULLIF(raw_payload->'item'->>'product_name', ''),
    t.product_name
  ),
  status = CASE 
    WHEN LOWER(COALESCE(
      raw_payload->'data'->'invoice'->>'status',
      raw_payload->'data'->>'status',
      raw_payload->>'status',
      ''
    )) IN ('approved', 'authorized', 'paid') THEN 'authorized'
    WHEN LOWER(COALESCE(
      raw_payload->'data'->'invoice'->>'status',
      raw_payload->'data'->>'status',
      raw_payload->>'status',
      ''
    )) IN ('pix_created', 'bank_slip_created', 'pending', 'waiting_payment') THEN 'pending'
    ELSE t.status
  END,
  order_id = COALESCE(
    t.order_id,
    (raw_payload->'data'->'invoice'->>'id')::bigint,
    (raw_payload->'data'->>'id')::bigint
  ),
  updated_at = NOW()
WHERE funnel_id = '10000000-0000-0000-0000-000000000001'
  AND (paid_amount = 0 OR paid_amount IS NULL OR product_name IS NULL OR product_name = '');
