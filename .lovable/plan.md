

## Situação Atual do Menu de Leads

Hoje existe **apenas 1 link** no sidebar: `Funis de Leads` → `/lead-campaigns`, que abre a listagem de campanhas/funis. Dentro de cada funil há tabs (Kanban, Visual, Flow Editor, Config, Webhook), mas não há:

- Uma **lista geral de leads** (busca, filtros, exportação)
- Um **dashboard de leads** com métricas (total, novos/dia, por fonte, conversão)
- Uma visão de **leads por fonte/UTM**

### Proposta: Expandir a seção "Leads" no sidebar

```text
Sidebar atual:              Sidebar proposto:
─────────────               ─────────────────
Funis de Leads              LEADS
  └ Funis de Leads            ├ Dashboard Leads    (novo)
                               ├ Todos os Leads     (novo)
                               ├ Funis de Leads     (existente)
                               └ Fontes / UTMs      (novo)
```

### Páginas propostas

**1. Dashboard de Leads** (`/leads/dashboard`)
- Cards: total de leads, novos hoje/semana, taxa de conversão por funil
- Gráfico de leads por dia (linha)
- Breakdown por UTM source (pizza/barras)
- Top funis por volume

**2. Todos os Leads** (`/leads`)
- Tabela pesquisável com nome, email, telefone, funil atual, etapa, data de entrada
- Filtros: por funil, por etapa, por UTM source, por período
- Click abre o `LeadTimeline` (já existe)
- Botão exportar CSV

**3. Fontes / UTMs** (`/leads/fontes`)
- Tabela agrupada por `utm_source` × `utm_medium`
- Contagem de leads e taxa de conversão por fonte
- Reutiliza dados de `lead_stage_positions` + `leads`

### Alterações técnicas

1. **Sidebar** (`AppSidebar.tsx`): Renomear seção "Funis de Leads" → "Leads", adicionar 3 itens (Dashboard, Todos os Leads, Funis, Fontes)
2. **Hooks**: Criar `useAllLeads()` e `useLeadStats()` que consultam `leads` + `lead_stage_positions` sem filtro de funil
3. **Páginas**: Criar `src/pages/LeadsDashboard.tsx`, `src/pages/LeadsList.tsx`, `src/pages/LeadsSources.tsx`
4. **Rotas** (`App.tsx`): Adicionar as 3 novas rotas
5. **Sem alterações no Supabase** — tudo usa tabelas existentes (`leads`, `lead_stage_positions`, `lead_funnel_stages`)

