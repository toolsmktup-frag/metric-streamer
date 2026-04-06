
Diagnóstico confirmado

- O `FunilResumo.tsx` lê vendas via `useAllSales(id, 'webhook')` e `useAllSalesAggregation(id, 'webhook', funnelProducts)`.
- O `useAllSales.ts` filtra `v_all_sales.purchased_at` estritamente pelo período global do `DateRangePicker`.
- Nos prints, o resumo continua em `04/04 - 05/04`, mas as vendas aprovadas do Guia de Tinturas estão em `02/04`.
- Então o pipeline não parece estar “sem trazer”; o problema é que a UI zera silenciosamente quando há vendas fora do período e isso parece erro.

Plano de implementação

1. Adicionar um hook de diagnóstico do funil
- Criar um hook leve para consultar em `v_all_sales`:
  - primeira venda aprovada do funil
  - última venda aprovada do funil
  - quantidade de vendas aprovadas no período atual
- Não precisa migration nova; é só leitura.

2. Melhorar o estado vazio do `FunilResumo`
- Em `src/pages/FunilResumo.tsx`, quando `sales = 0` no período atual mas existirem vendas fora dele, exibir aviso claro:
  - “Sem vendas aprovadas entre 04/04 e 05/04. Última venda aprovada deste funil: 02/04.”
- Deixar explícito que pode haver gasto da Meta no período mesmo sem venda aprovada.

3. Adicionar ações rápidas de período
- Botões no alerta para:
  - “Ver última venda”
  - “Últimos 7 dias”
  - “Todo o período”
- Esses botões usarão `setDateRange` do `useFilterStore`.

4. Reduzir confusão de filtro
- Revisar o uso duplicado do `DateRangePicker` no layout e na página do funil.
- Melhor caminho: manter um filtro principal visível e evitar a sensação de que há dois períodos diferentes.

Arquivos previstos
- `src/pages/FunilResumo.tsx`
- `src/hooks/useAllSales.ts` ou novo hook dedicado, como `useFunnelSalesAvailability.ts`
- possivelmente `src/components/dashboard/DateRangePicker.tsx` se precisarmos reaproveitar presets/atalhos

Critérios de aceite
- Em `04/04–05/04`, o resumo não fica “mudo”: mostra o aviso com a data real da última venda.
- Ao clicar em “Ver última venda” ou “Últimos 7 dias”, o resumo passa a exibir as vendas de `02/04`.
- Mantém a regra atual: só `authorized` conta como venda e o funil de tráfego continua filtrando `ingestion_type = 'webhook'`.
