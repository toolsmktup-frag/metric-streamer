-- ═══════════════════════════════════════════════════════════════════
-- FIX CRÍTICO: Idempotência de webhook Ticto
--
-- Problema raiz: Ticto envia múltiplos eventos para o mesmo
-- pedido+produto com transaction_hash diferentes (cada re-envio
-- gera um hash novo). O upsert por transaction_hash criava N linhas
-- em vez de atualizar 1 → duplicatas em ticto_transactions →
-- duplicatas em customer_purchases → receita fantasma.
--
-- Solução:
--   1. Backup + DELETE de duplicatas em ticto_transactions
--      (mantém a mais recente — status_date mais alto — por
--       order_id+product_id, pois queremos o status final)
--   2. UNIQUE(order_id, product_id) — bloqueia futuros dupes
--   3. UNIQUE PARTIAL em customer_purchases(platform,
--      platform_order_id, product_name) WHERE platform_order_id
--      IS NOT NULL — segunda barreira de segurança
--
-- O webhook handler usa onConflict: "order_id,product_id" após
-- este fix (código atualizado separadamente).
--
-- ROLLBACK:
--   DROP INDEX IF EXISTS ux_ticto_tx_order_product;
--   DROP INDEX IF EXISTS ux_cp_ticto_order_product;
-- ═══════════════════════════════════════════════════════════════════

-- ── 1. Backup de duplicatas em ticto_transactions ─────────────────
CREATE TABLE IF NOT EXISTS public._backup_ticto_tx_dupes_20260316 AS
SELECT tt.*
FROM public.ticto_transactions tt
WHERE tt.order_id   IS NOT NULL
  AND tt.product_id IS NOT NULL
  AND tt.id IN (
    SELECT id FROM (
      SELECT
        id,
        ROW_NUMBER() OVER (
          PARTITION BY order_id, product_id
          ORDER BY
            COALESCE(status_date, order_date, '1970-01-01') DESC,
            id DESC
        ) AS rn
      FROM public.ticto_transactions
      WHERE order_id   IS NOT NULL
        AND product_id IS NOT NULL
    ) ranked
    WHERE rn > 1
  );

DO $$
DECLARE v_count int;
BEGIN
  SELECT COUNT(*) INTO v_count FROM public._backup_ticto_tx_dupes_20260316;
  RAISE NOTICE 'Backup de ticto_transactions: % linhas duplicadas.', v_count;
END $$;

-- ── 2. Delete duplicatas — mantém mais recente por (order_id, product_id) ──
DELETE FROM public.ticto_transactions
WHERE order_id   IS NOT NULL
  AND product_id IS NOT NULL
  AND id IN (
    SELECT id FROM (
      SELECT
        id,
        ROW_NUMBER() OVER (
          PARTITION BY order_id, product_id
          ORDER BY
            COALESCE(status_date, order_date, '1970-01-01') DESC,
            id DESC
        ) AS rn
      FROM public.ticto_transactions
      WHERE order_id   IS NOT NULL
        AND product_id IS NOT NULL
    ) ranked
    WHERE rn > 1
  );

-- ── 3. Validação ──────────────────────────────────────────────────
DO $$
DECLARE
  v_backup  int;
  v_remain  int;
BEGIN
  SELECT COUNT(*) INTO v_backup FROM public._backup_ticto_tx_dupes_20260316;
  SELECT COUNT(*) INTO v_remain
  FROM (
    SELECT order_id, product_id, COUNT(*)
    FROM public.ticto_transactions
    WHERE order_id IS NOT NULL AND product_id IS NOT NULL
    GROUP BY order_id, product_id
    HAVING COUNT(*) > 1
  ) t;
  RAISE NOTICE 'ticto_transactions: % dupes removidas. Grupos ainda duplicados: %.', v_backup, v_remain;
  IF v_remain > 0 THEN
    RAISE WARNING 'Ainda há % grupos duplicados em ticto_transactions — verificar.', v_remain;
  END IF;
END $$;

-- ── 4. UNIQUE constraint em ticto_transactions(order_id, product_id) ──
-- Bloqueia inserção de duplicatas via webhook a partir de agora.
-- WHERE garante que NULLs (pedidos sem product_id) não colidam.
CREATE UNIQUE INDEX IF NOT EXISTS ux_ticto_tx_order_product
  ON public.ticto_transactions (order_id, product_id)
  WHERE order_id IS NOT NULL AND product_id IS NOT NULL;

-- ── 5. UNIQUE PARTIAL em customer_purchases (segunda barreira) ────
-- Impede que import-ticto-csv e process-import criem dupes também.
CREATE UNIQUE INDEX IF NOT EXISTS ux_cp_ticto_order_product
  ON public.customer_purchases (platform, platform_order_id, product_name)
  WHERE platform = 'ticto' AND platform_order_id IS NOT NULL;

COMMENT ON INDEX public.ux_ticto_tx_order_product IS
  'Garante idempotência do webhook Ticto: mesmo order_id+product_id '
  'sempre faz UPDATE (via upsert) em vez de INSERT novo.';

COMMENT ON INDEX public.ux_cp_ticto_order_product IS
  'Segunda barreira anti-duplicata: import CSV e process-import '
  'não podem criar duas linhas para o mesmo pedido+produto da Ticto.';
