
Objetivo: confirmar se a correção vai refletir nesta tela e o que ainda falta para isso acontecer.

Sim — vai aparecer aqui na plataforma, mas somente depois de completar 3 pontos. Hoje, pelo código atual, ainda não basta ter rodado só os SQLs.

O que eu confirmei no código
- Esta tela `/funis/10000000-0000-0000-0000-000000000001/resumo` lê vendas por:
  - `useAllSalesAggregation(id)` para KPIs
  - `useAllSales(id)` para lista agregada por produto
- Esses hooks consultam a view `v_all_sales`.
- A view `v_all_sales` usa `ticto_transactions.paid_amount / 100` e `product_name`.
- Portanto, se `paid_amount` e `product_name` forem corrigidos no banco, esta tela atualiza automaticamente.

O ponto crítico que ainda falta
- No arquivo atual `supabase/functions/ticto-webhook/index.ts`, o parser ainda extrai dados de:
  - `payload.order | payload.sale | payload.payment`
  - `payload.item | payload.product | payload.items[0]`
- Ele não está tratando explicitamente o formato aninhado `payload.data.invoice`.
- Então, se o payload real da Ticto vier nesse formato, novas vendas ainda podem continuar entrando com:
  - `paid_amount = 0`
  - `product_name = ""`
  - `order_id = null`

Conclusão prática
- Sim, isso vai resolver e aparecer aqui.
- Mas para aparecer de fato nesta tela, precisa desta sequência:

1. Corrigir o webhook da Ticto
- Ajustar o parser para ler `payload.data.invoice` e seus campos derivados.
- Incluir esse fallback para:
  - valor pago
  - nome do produto
  - status
  - order_id
  - datas
  - customer/payment/tracking quando aplicável

2. Fazer deploy da Edge Function
- Sem deploy, a plataforma continua usando a versão antiga do webhook.
- Isso afeta novas entradas.

3. Fazer backfill das 7 transações já gravadas erradas
- As vendas antigas não se corrigem sozinhas.
- Mesmo com o webhook corrigido, as linhas já salvas com zero continuam zeradas até serem atualizadas.

4. Recarregar/refazer a leitura no frontend
- Como a tela já consome `v_all_sales`, depois do backfill os cards devem refletir:
  - Faturamento Líquido
  - Ticket Médio
  - Lucro / ROAS / CPA
  - Vendas por Produto deixando de mostrar “Sem nome”

O que deve mudar aqui depois disso
- `Faturamento Líquido` sai de R$ 0,00
- `Ticket Médio` sai de R$ 0,00
- `Vendas por Produto` passa a mostrar o nome real
- `ROAS` e `Lucro` recalculam automaticamente
- Se houver vendas aprovadas suficientes, o gráfico também passa a refletir receita real

Detalhes técnicos
- Fonte da tela: `src/pages/FunilResumo.tsx`
- Fonte dos dados: `src/hooks/useAllSales.ts`
- Fonte financeira unificada: `public.v_all_sales`
- Gargalo atual: ingestão no `supabase/functions/ticto-webhook/index.ts`
- Sintoma atual esperado: como `approved` usa `status === 'authorized'` e soma `revenue`, qualquer linha com `paid_amount = 0` continuará zerando os KPIs

Plano de implementação
1. Atualizar o parser do webhook para suportar `data.invoice`
2. Revisar fallbacks de amount/product/status/order_id
3. Garantir que o upsert preserve dados bons
4. Montar SQL de backfill para as transações já corrompidas
5. Validar que o funil “Guia de Tinturas” passa a refletir os valores automaticamente nesta tela
