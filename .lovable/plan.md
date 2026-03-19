

## Plano: Fix limite 1000 rows + Nova view "Resumo + Lista"

### 1. Fix `src/hooks/useBulkLeadPurchases.ts`
- Adicionar `.limit(100000)` na chamada RPC para quebrar o limite default do Supabase
- O tipo `total_orders` mudou para `bigint` na RPC -- ajustar cast para `Number()`

### 2. Criar `src/components/lead-funnels/BaseLeadsList.tsx`
Nova view "Resumo + Lista" para funis tipo base (muitos leads, 1 coluna):

- **Topo**: 4 cards de resumo
  - Total de leads
  - Leads com compra (count + %)
  - LTV total (soma)
  - Ticket médio
- **Tabela**: com colunas Nome, Email, Telefone, LTV, Compras, Primeira compra, Entrada
  - Busca por nome/email/telefone
  - Ordenação por LTV (default), nome, data
  - Paginação client-side (50 por página)
  - Botão WhatsApp no telefone
  - Click no lead abre timeline (via `onLeadClick`)

### 3. Atualizar `src/pages/LeadFunnelDetail.tsx`
- Detectar funil "base": nome contém "BASE" (case-insensitive) OU tem apenas 1 etapa
- Se base: renderizar `BaseLeadsList` no lugar do `KanbanBoard`
- Manter todas as outras tabs (Visual, Flow, Métricas, Config, Webhook)

### Arquivos

| Arquivo | Ação |
|---------|------|
| `src/hooks/useBulkLeadPurchases.ts` | Adicionar `.limit(100000)` |
| `src/components/lead-funnels/BaseLeadsList.tsx` | **Novo** |
| `src/pages/LeadFunnelDetail.tsx` | Condicional base vs kanban |

