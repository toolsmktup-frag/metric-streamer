

## Plano Consolidado — Kanban CRM: Paginação + LTV nos Cards + Ordenação

Tudo que discutimos nas últimas conversas, unificado:

### 1. Corrigir limite de 1000 leads (`useLeads.ts`)
O Supabase retorna no máximo 1000 linhas por query. O dashboard já usa `fetchAllRows` com paginação em loop — o Kanban não.

- Replicar o helper `fetchAllRows` do `useAllLeads.ts` dentro do `useLeads.ts`
- Aplicar em `useLeadsByFunnel` (busca paginada de `lead_stage_positions` com join de `leads`)
- Aplicar em `useFunnelLeadCounts` (busca paginada só de `stage_id`)

### 2. Novo hook bulk de compras (`useBulkLeadPurchases.ts`)
Elimina o problema N+1 (hoje cada LeadCard faz 2-3 queries individuais).

- Recebe o array de positions do board
- Extrai emails e phones únicos de todos os leads
- Faz **2 queries batch**: `unified_customers` por email/phone, depois `customer_purchases` por customer_ids
- Retorna `Map<leadId, { totalSpent, totalOrders }>`

### 3. Exibir LTV e compras no LeadCard (`LeadCard.tsx`)
- Remover o hook individual `useLeadPurchases` do card
- Receber nova prop `purchaseSummary?: { totalSpent: number; totalOrders: number }`
- Badges de LTV (valor total aprovado) e contagem (×N) no topo do card, visíveis
- Manter badges de produto/status do metadata como contexto específico daquela posição no funil

**Lógica multi-produto**: LTV é global (tudo que a pessoa comprou em todos os produtos), badges de produto/status mostram o contexto daquela entrada específica no funil.

### 4. Novos modos de ordenação (`KanbanBoard.tsx`)
- Chamar `useBulkLeadPurchases(positions)` uma vez no board
- Passar `purchaseSummary` para cada card
- Botão de sort cicla entre 4 modos:

| Modo | Label | Critério |
|------|-------|----------|
| `recent` | Mais recentes | `entered_at` desc |
| `value` | Maior valor | `metadata.amount` desc |
| `orders` | Mais compras | `totalOrders` desc |
| `ltv` | Maior LTV | `totalSpent` desc |

### Arquivos
| Arquivo | Ação |
|---------|------|
| `src/hooks/useLeads.ts` | Paginação com `fetchAllRows` |
| `src/hooks/useBulkLeadPurchases.ts` | Novo — hook bulk |
| `src/components/lead-funnels/LeadCard.tsx` | Remover hook individual, receber prop |
| `src/components/lead-funnels/KanbanBoard.tsx` | Integrar bulk, 4 modos de sort |

