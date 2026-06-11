-- ════════════════════════════════════════════════════════════════════
-- Recompra/Recontato — Fase 4: backfill histórico da quantidade de potes.
-- Replica a precedência do parser _shared/potQuantity.ts (validado em testes):
--   mapping (product_offer_mappings) > parser "N potes" > parser "N dias" > default(1).
-- A coluna já tem DEFAULT 1, então só corrige os casos >1 / marca a fonte.
-- IDEMPOTENTE (cada passo só toca linhas com quantity_source ainda nulo).
-- ════════════════════════════════════════════════════════════════════

-- 1) Override exato via product_offer_mappings
UPDATE public.customer_purchases cp
SET quantity = pom.quantity, quantity_source = 'mapping'
FROM public.product_offer_mappings pom
WHERE cp.quantity_source IS NULL
  AND lower(btrim(cp.offer_name)) = lower(btrim(pom.offer_name))
  AND pom.quantity > 0;

-- 2) "N potes" no offer_name
UPDATE public.customer_purchases cp
SET quantity = (substring(cp.offer_name from '(?i)(\d{1,3})\s*potes?'))::int,
    quantity_source = 'parser_potes'
WHERE cp.quantity_source IS NULL
  AND cp.offer_name ~* '(\d{1,3})\s*potes?'
  AND (substring(cp.offer_name from '(?i)(\d{1,3})\s*potes?'))::int BETWEEN 1 AND 100;

-- 3) "N potes" no product_name (fallback)
UPDATE public.customer_purchases cp
SET quantity = (substring(cp.product_name from '(?i)(\d{1,3})\s*potes?'))::int,
    quantity_source = 'parser_potes'
WHERE cp.quantity_source IS NULL
  AND cp.product_name ~* '(\d{1,3})\s*potes?'
  AND (substring(cp.product_name from '(?i)(\d{1,3})\s*potes?'))::int BETWEEN 1 AND 100;

-- 4) "N dias" → potes = round(dias/30)
UPDATE public.customer_purchases cp
SET quantity = GREATEST(1, round(
      (substring(coalesce(cp.offer_name,'')||' '||coalesce(cp.product_name,'') from '(?i)(\d{1,4})\s*dias?'))::numeric / 30
    ))::int,
    quantity_source = 'parser_dias'
WHERE cp.quantity_source IS NULL
  AND (coalesce(cp.offer_name,'')||' '||coalesce(cp.product_name,'')) ~* '(\d{1,4})\s*dias?';

-- 5) resto: default (quantity permanece 1)
UPDATE public.customer_purchases SET quantity_source = 'default' WHERE quantity_source IS NULL;
