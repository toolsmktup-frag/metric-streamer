

## Plano: Filtrar Dashboard de Leads pelo DateRangePicker

### Problema
O `DateRangePicker` existe no topo da página, mas o `useLeadStats()` ignora completamente o `dateRange` do `filterStore`. Ele busca **todos** os leads e calcula stats fixas (hoje, 7 dias, 30 dias). O filtro de data não afeta nada.

### Solução

**1. `src/hooks/useAllLeads.ts` — `useLeadStats()` recebe dateRange**
- Aceitar parâmetros `startDate` e `endDate`
- Incluir no `queryKey` para reagir a mudanças
- Filtrar `leadsWithEntryDate` pelo range selecionado antes de calcular KPIs
- Total, bySource, byFunnel, dailyLeads — tudo filtrado pelo período
- "Novos Hoje" e "Novos (7 dias)" continuam relativos à data atual (não mudam com filtro)

**2. `src/pages/LeadsDashboard.tsx` — Passar dateRange do filterStore**
- Importar `useFilterStore`
- Passar `dateRange.start` e `dateRange.end` para `useLeadStats()`
- KPI "Total de Leads" passa a mostrar o total **no período selecionado**

### Resultado
- Selecionar "Hoje" → mostra só leads de hoje
- Selecionar "Últimos 7 dias" → filtra tudo por 7 dias
- Gráfico de leads/dia, pie de fonte e bar de funil — todos respeitam o filtro

