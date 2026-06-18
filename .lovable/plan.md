## Diagnóstico

Não é bug de dados — é **diferença de período entre as telas**:

| Tela | Fonte do período | Como conta vendas |
|---|---|---|
| **Resumo** (`FunilResumo.tsx`) | `useFilterStore().dateRange` (ex.: "Hoje") | `totalSales.sales_count` de `useAllSalesAggregation` → todas as vendas `authorized` do funil no período |
| **Campanhas** (`FunilCampanhas.tsx`) | mesmo `useFilterStore().dateRange` | mesma agregação, mas só vendas com `meta_campaign_id` (tráfego pago) |
| **KPI do Funil** (`FunilKpi.tsx`) | **seletor próprio de MÊS** (`selectedMonth/selectedYear`, linhas 270–314) — ignora o `filterStore` | soma `vendas_principal + bump1 + upsell1/2/3` do **mês inteiro** |

Por isso o KPI mostra 6 e o Resumo 3: a tela KPI está somando o mês de junho inteiro do Guia de Tinturas, enquanto o Resumo está limitado a "Hoje". As 3 extras são vendas anteriores do mês (principal + bumps + upsells) — não há duplicidade, classificação errada nem inconsistência de status.

Confirmação rápida (opcional, sem mudar código): no FunilKpi, observe o seletor de mês no topo direito — ele controla totalmente os números daquela tela.

## Correção proposta

Unificar o período: fazer o FunilKpi também usar o `dateRange` global (`useFilterStore`), igual às outras duas telas. Assim, ao selecionar "Hoje", os 3 valores batem.

### Mudanças em `src/pages/FunilKpi.tsx`

1. Remover `selectedMonth`/`selectedYear` e o `MonthPicker` do header.
2. Trocar `monthStart`/`monthEnd` por `dateRange.start`/`dateRange.end` vindo de `useFilterStore`.
3. Atualizar `dateFrom`/`dateTo` (usados nas queries Meta e `v_all_sales`) para refletirem o intervalo global.
4. Recalcular `allDays` a partir do intervalo do `dateRange` (em vez de "dias do mês").
5. Trocar `daysWithData`/labels "X vendas/dia" para considerar o tamanho do período selecionado.
6. Substituir o componente do seletor de mês pelo `DateRangePicker` global (mesmo usado em `FunilResumo`).

### O que NÃO mexer

- Lógica de classificação (`classifyByFunnelProducts`, slots).
- Hooks de vendas (`v_all_sales`).
- Resumo e Campanhas.

## Resultado esperado

- "Hoje" no filtro global → KPI, Resumo e Campanhas mostram exatamente o mesmo número (3).
- "Este mês" no filtro global → KPI mostra os mesmos 6 que mostrava antes.
- Sem mais "duas verdades" por causa de seletores de data diferentes.

Quer que eu aplique essa unificação?