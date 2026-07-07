-- ═══════════════════════════════════════════════════════════════════
-- Índices de data para o dashboard de vendas (incidente 07/07)
--
-- Sintoma: Resumo zerado ("Faturamento R$ 0,00") com gasto/impressões
-- normais. Causa: a consulta do front (v_all_sales_classified com
-- filtro de purchased_at + ORDER BY) fazia seq scan dos dois braços da
-- v_all_sales (ticto_transactions ~68k + customer_purchases ~70k) a
-- cada carga; com cache frio levava 6-8s+ e estourava o statement
-- timeout (57014) → React Query erra e os cards renderizam zero.
--
-- Fix: índices descendentes nas colunas de data usadas por filtro e
-- ordenação. order_date já é timestamptz (o ::timestamptz da view é
-- no-op e não impede o uso do índice).
-- ═══════════════════════════════════════════════════════════════════

create index if not exists idx_ticto_transactions_order_date
  on public.ticto_transactions (order_date desc nulls last);

create index if not exists idx_customer_purchases_purchased_at
  on public.customer_purchases (purchased_at desc nulls last);
