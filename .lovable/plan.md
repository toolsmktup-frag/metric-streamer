## Problema

O botão **Exportar CSV** em `Todos os Leads` (`src/pages/LeadsList.tsx`) só exporta os 50 leads da página atual, porque usa o array `leads` vindo do `usePaginatedLeads` (paginado em `PAGE_SIZE = 50`). Por isso, mesmo com 1.423 leads filtrados, o CSV sai com apenas 50.

## Correção

Refatorar `exportCSV` para buscar **todos os leads filtrados** antes de gerar o CSV, respeitando os filtros ativos (busca, funil, fonte).

### Passos

1. Em `src/pages/LeadsList.tsx`:
   - Tornar `exportCSV` assíncrono.
   - Adicionar estado `isExporting` para desabilitar o botão e mostrar spinner enquanto roda.
   - Chamar a RPC `search_leads_paginated` (mesma usada por `usePaginatedLeads`) com os filtros atuais (`debouncedSearch`, `funnelFilter`, `sourceFilter`), em **lotes de 1000** (`p_limit: 1000`, `p_offset` incremental) até trazer `total` registros — evita estourar limites do PostgREST/Supabase e segue o padrão de paginação do projeto.
   - Concatenar todos os leads retornados e gerar o CSV com o mesmo cabeçalho/colunas atuais.
   - Manter o cálculo de `Total Gasto` via `spentMap` já carregado (lookup por email).

2. UX:
   - Botão mostra "Exportando..." com `Loader2` enquanto baixa.
   - Toast (opcional) com `Exportados X leads` ao final, usando `useToast` já disponível no projeto.

### Detalhes técnicos

- Não muda o hook `usePaginatedLeads` (continua paginando a tela em 50).
- A chamada de export usa `(supabase as any).rpc('search_leads_paginated', { p_search, p_funnel_id, p_source, p_limit: 1000, p_offset })` diretamente dentro de `exportCSV`, em loop até `leads.length >= total`.
- Sem alterações no backend (a RPC já suporta limit/offset).
- Sem alterações em outras telas.

### Arquivos afetados

- `src/pages/LeadsList.tsx` (única alteração)