-- ═══════════════════════════════════════════════════════════════════
-- FIX CRÍTICO: Remove duplicatas de webhook Ticto em customer_purchases
--
-- Problema: webhook da Ticto disparava múltiplas vezes para o mesmo
-- pedido+produto, gerando N linhas com platform_transaction_id distintos
-- mas mesmo platform_order_id e product_name.
-- A constraint UNIQUE é em (platform, platform_transaction_id), então
-- linhas com TXIDs diferentes passavam — mesmo sendo o mesmo evento.
--
-- Escala: 960 linhas duplicadas em 195 pedidos → R$47.672 de receita
-- fantasma removida.
--
-- Estratégia: para cada (platform_order_id, product_name), mantém a
-- linha mais antiga (menor created_at). Deleta o restante.
--
-- ROLLBACK: não há rollback — dados foram gerados por bug de webhook.
--           Backup implícito: ticto_transactions (fonte bruta) é preservada.
-- ═══════════════════════════════════════════════════════════════════

-- Backup de segurança antes de deletar
CREATE TABLE IF NOT EXISTS public._backup_ticto_webhook_dupes_20260316 AS
SELECT cp.*
FROM public.customer_purchases cp
WHERE cp.platform = 'ticto'
  AND cp.status   = 'authorized'
  AND cp.platform_order_id IS NOT NULL
  AND cp.id IN (
    SELECT id FROM (
      SELECT
        id,
        ROW_NUMBER() OVER (
          PARTITION BY platform_order_id, product_name
          ORDER BY created_at ASC, platform_transaction_id ASC
        ) AS rn
      FROM public.customer_purchases
      WHERE platform = 'ticto'
        AND status = 'authorized'
        AND platform_order_id IS NOT NULL
    ) ranked
    WHERE rn > 1
  );

-- Confirma quantas linhas foram salvas no backup
DO $$
DECLARE v_count int;
BEGIN
  SELECT COUNT(*) INTO v_count FROM public._backup_ticto_webhook_dupes_20260316;
  RAISE NOTICE 'Backup criado com % linhas duplicadas.', v_count;
END $$;

-- Delete: remove duplicatas, mantém a linha mais antiga por (order_id, product)
DELETE FROM public.customer_purchases
WHERE platform = 'ticto'
  AND status   = 'authorized'
  AND platform_order_id IS NOT NULL
  AND id IN (
    SELECT id FROM (
      SELECT
        id,
        ROW_NUMBER() OVER (
          PARTITION BY platform_order_id, product_name
          ORDER BY created_at ASC, platform_transaction_id ASC
        ) AS rn
      FROM public.customer_purchases
      WHERE platform = 'ticto'
        AND status   = 'authorized'
        AND platform_order_id IS NOT NULL
    ) ranked
    WHERE rn > 1
  );

-- Valida resultado
DO $$
DECLARE
  v_remaining_dupes int;
  v_backup_count    int;
BEGIN
  SELECT COUNT(*) INTO v_backup_count
  FROM public._backup_ticto_webhook_dupes_20260316;

  SELECT COUNT(*) INTO v_remaining_dupes
  FROM (
    SELECT platform_order_id, product_name, COUNT(*) AS qtd
    FROM public.customer_purchases
    WHERE platform = 'ticto'
      AND status   = 'authorized'
      AND platform_order_id IS NOT NULL
    GROUP BY platform_order_id, product_name
    HAVING COUNT(*) > 1
  ) t;

  RAISE NOTICE 'Removidas % linhas duplicadas. Duplicatas restantes: %.', v_backup_count, v_remaining_dupes;

  IF v_remaining_dupes > 0 THEN
    RAISE WARNING 'Ainda há % grupos com duplicatas — verificar manualmente.', v_remaining_dupes;
  END IF;
END $$;
