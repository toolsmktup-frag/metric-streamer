# Mostrar origem da conta Guru na UI

A migration já rodou e a edge function `guru-webhook` já está gravando `guru_account_slug` em `customer_purchases` + `metadata.guru_account` no lead. Falta exibir e filtrar por essa origem nos lugares onde o usuário precisa enxergar de qual conta (Soulnaturi / Articulabem) a venda veio.

## O que entregar

1. **Badge da conta no LeadCard (Kanban)**
   - No `KanbanBoard` cada `LeadCard` mostra um chip pequeno colorido com o `display_name` da conta (cor vinda de `guru_accounts.color`).
   - Fonte: `lead.metadata.guru_account` (já presente) cruzado com o hook `useGuruAccounts`.
   - Se não tiver conta mapeada, não renderiza nada.

2. **Filtro por conta Guru em Vendas (`/vendas`)**
   - Adicionar um `Select` "Conta Guru" ao lado dos filtros existentes em `Vendas.tsx`.
   - Opções vêm de `useGuruAccounts` ("Todas" + cada conta).
   - Aplica filtro client-side em cima de `v_all_sales.guru_account_slug` (já exposto pela view).
   - Mostrar também uma coluna/badge "Conta" na tabela de vendas.

3. **Filtro por conta Guru na Base de Leads (`/leads-base` ou `LeadsList`)**
   - Mesmo padrão: `Select` de conta + badge na linha.
   - Filtro feito no server-side onde já existe paginação (`metadata->>guru_account`).

4. **Badge da conta na lista de funis / detalhe**
   - Em `LeadFunnelDetail` (cabeçalho do lead) mostrar o `GuruAccountBadge` já criado, ao lado do nome.

## Detalhes técnicos

- Hook `useGuruAccounts` (já existe) retorna `{ slug, display_name, color }[]` — usar como fonte única de cor/nome.
- Componente `GuruAccountBadge` (já existe) é reutilizado em todos os lugares.
- Nenhuma migration nova. Nenhum deploy de edge function novo.
- Filtro de Vendas: server-side em `v_all_sales` via `.eq('guru_account_slug', slug)`.
- Filtro de Base de Leads: usar `metadata->>guru_account` no `.eq()` do supabase-js.
- Persistir filtro selecionado em `localStorage` (`guru_account_filter`) pra manter entre navegações.

## Arquivos afetados

- `src/components/lead-funnels/LeadCard.tsx` (badge)
- `src/components/lead-funnels/KanbanBoard.tsx` (passar conta pro card se preciso)
- `src/pages/Vendas.tsx` (select + coluna)
- `src/pages/LeadsList.tsx` ou `BaseLeadsList.tsx` (select + badge + filtro server-side)
- `src/pages/LeadFunnelDetail.tsx` (badge no header)

Sem mexer em backend.
