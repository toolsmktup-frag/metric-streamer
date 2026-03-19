

## Adicionar KPI "Clientes" no Resumo

### Problema
O Resumo mostra 8 KPIs (Faturamento, Gastos, ROAS, Lucro, Vendas, Ticket Médio, CPA, Impressões) mas não mostra a contagem de **clientes únicos** — dado que aparece na Inteligência de Cliente (36.456).

### Solução

**Arquivo: `src/pages/Resumo.tsx`**

1. Calcular clientes únicos a partir do `allSales` já carregado, agrupando por `customer_email` (deduplica compras do mesmo cliente)
2. Adicionar um 9º KPI card "Clientes" com ícone `Users` na grid de KPIs
3. Suportar variação com período anterior (compareEnabled)

```
const uniqueCustomers = new Set(approved.filter(t => t.customer_email).map(t => t.customer_email!.toLowerCase().trim())).size;
```

**Nota**: O número pode diferir ligeiramente do Inteligência de Cliente quando o filtro de data não for "Todo o período", pois o Resumo filtra por data e a Inteligência de Cliente usa a função RFM que analisa todos os registros históricos. Com "Todo o período" selecionado, os números devem convergir (diferenças pequenas podem existir pela lógica de identity resolution do RFM).

