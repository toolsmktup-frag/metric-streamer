

## Plano: Filtro por Funil com opcao de fixar visualizacao

### Resumo simples
Hoje o dashboard carrega TODOS os leads e demora. A ideia e adicionar um dropdown de funil no topo que filtra tudo (KPIs, graficos). O usuario pode "fixar" um funil como padrao — assim toda vez que abrir a pagina (ele ou os vendedores), ja abre filtrado naquele funil. Se quiser ver tudo, seleciona "Todos os Funis".

### Mudancas

**1. `src/hooks/useAllLeads.ts` — Query separada para lista de funis + filtro no useLeadStats**

- Nova funcao `useFunnelList()`: query simples em `lead_funnels` retornando `id, name, color` — carrega rapido, independente de qualquer filtro
- `useLeadStats()` ganha parametro `funnelId?: string | null`
- Quando `funnelId` e fornecido, filtra `filteredLeadIds` para apenas leads que tem posicao naquele funil
- Todos os KPIs e graficos passam a refletir so os leads do funil selecionado

**2. `src/pages/LeadsDashboard.tsx` — Dropdown de funil + botao de fixar**

- Importar `Select` + `useFunnelList()`
- State: `selectedFunnelId` inicializado do `localStorage` (chave `leads-dashboard-pinned-funnel`)
- Dropdown ao lado do DateRangePicker: "Todos os Funis" + lista de funis
- Icone de "pin" (📌) ao lado do dropdown — ao clicar, salva o funil atual no `localStorage` como padrao. Se ja esta fixado, clicar de novo remove a fixacao
- Toast confirmando: "Visualizacao fixada: [nome do funil]"
- Passa `selectedFunnelId` para `useLeadStats(dateRange.start, dateRange.end, selectedFunnelId)`
- Manter o botao Sincronizar como esta (sem mexer nele agora)

### Fluxo do usuario
1. Abre dashboard → carrega com o funil fixado (ou "Todos" se nenhum fixado)
2. Troca o dropdown para outro funil → dashboard atualiza
3. Clica no pin → fixa aquele funil como padrao
4. Proximo acesso (dele ou de qualquer vendedor naquele navegador) → ja abre no funil fixado

### Detalhe tecnico
A "fixacao" e por navegador (localStorage). Se quiser que seja por usuario (todos veem o mesmo), precisaria salvar no banco — mas por enquanto localStorage resolve o caso de uso descrito.

