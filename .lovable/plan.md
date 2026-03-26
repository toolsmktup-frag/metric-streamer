

## O que grandes empresas fazem: Paginação no servidor (Server-Side Pagination)

### O problema atual
A tela "Base de Leads" carrega **todos os 15k+ leads** de uma vez do Supabase (em batches de 1000), junta com posições e funis no frontend, e só depois renderiza. Com Guru + Eduzz + Ticto, isso vai crescer pra 30k+. Cada acesso dispara 3 queries exaustivas em paralelo.

### O que empresas como HubSpot, Salesforce e Pipedrive fazem

1. **Paginação no servidor** — Nunca carregam tudo. Buscam 50-100 registros por vez, com `LIMIT/OFFSET` ou cursor-based pagination.
2. **Busca no banco** — Filtros de texto (nome, email) rodam como `ILIKE` no SQL, não no JavaScript.
3. **Contagens separadas** — Um `SELECT COUNT(*)` rápido retorna o total sem carregar dados.
4. **Caching inteligente** — React Query mantém a página anterior visível enquanto a próxima carrega.

### Plano de implementação

**1. Criar RPC no Supabase para busca paginada**
- Uma função `search_leads_paginated(p_search, p_funnel_id, p_source, p_limit, p_offset)` que faz JOIN de `leads` + `lead_stage_positions` + `lead_funnels` + `lead_funnel_stages` direto no banco
- Retorna leads com posição, nome do funil/etapa, cores — tudo pronto
- Filtros de texto rodam como `ILIKE` no PostgreSQL (muito mais rápido que filtrar 15k no JS)
- Retorna também o `total_count` para a paginação

**2. Refatorar `useAllLeads` → `usePaginatedLeads`**
- Novo hook que recebe `{ search, funnelId, source, page, pageSize }`
- Chama a RPC com os parâmetros
- React Query com `keepPreviousData: true` para transição suave entre páginas
- Sem loop de fetchAllRows — uma única chamada por página

**3. Refatorar `LeadsList.tsx`**
- Trocar `useAllLeads()` por `usePaginatedLeads(filters)`
- Adicionar paginação real (já existe componente `Pagination` no projeto)
- Filtros chamam o servidor em vez de filtrar localmente
- Debounce de 300ms no campo de busca para não sobrecarregar

**4. Manter `useLeadStats` separado**
- As estatísticas do dashboard continuam com a lógica atual (são agregações, não listagem)

### Resultado esperado
- **Tempo de carregamento**: de ~10-15s → <1s por página
- **Escala**: funciona igual com 15k ou 500k leads
- **UX**: Navegação fluida com paginação, filtros instantâneos

