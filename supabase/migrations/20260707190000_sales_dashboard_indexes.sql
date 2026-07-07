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

-- A view EM PRODUÇÃO (≠ docs/enrich-v-all-sales.sql; snapshot real em
-- docs/v_all_sales-PROD-2026-07-07.sql) usa COALESCE(order_date, created_at)
-- como purchased_at no braço Ticto — o índice simples em order_date não
-- serve pro filtro/sort. Índice de expressão cobre exatamente o predicado.
-- Resultado medido: consulta do Resumo caiu de 6,6s (fria, estourando o
-- statement_timeout de 8s do role authenticated) para ~0,95s estável.
create index if not exists idx_ticto_transactions_effective_date
  on public.ticto_transactions ((coalesce(order_date, created_at)) desc);
