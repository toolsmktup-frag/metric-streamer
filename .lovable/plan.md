

## Diagnóstico: Lead duplicado no Kanban

### O que aconteceu

Existem **dois problemas** que explicam por que Dani e Gabi viram o mesmo lead (Maria Dulce):

### Problema 1: Regra de visibilidade do Kanban

A regra atual no `KanbanBoard.tsx` (linha 74) é:

```text
Vendedor vê: leads SEM vendedor atribuído + leads atribuídos A ELE
```

Isso significa que **enquanto um lead não tem vendedora atribuída, TODAS as vendedoras o veem**. Quando a Gabi atribuiu o lead a si mesma, a Dani continuou vendo até dar refresh — não há sincronização em tempo real.

### Problema 2: Possível posição duplicada no funil

A tabela `lead_stage_positions` **não tem constraint UNIQUE** em `(lead_id, funnel_id)`. Se dois webhooks (ex: compra dos 3 potes + upsell dos 9 potes) chegaram quase ao mesmo tempo, a verificação via `SELECT ... LIMIT 1` na RPC `sync_lead_from_sale` pode falhar por race condition, criando **duas entradas** para o mesmo lead no mesmo funil. Isso faria o lead aparecer duas vezes no Kanban.

### Correções propostas

**1. Constraint UNIQUE no banco** (SQL no Supabase)
- `ALTER TABLE lead_stage_positions ADD CONSTRAINT unique_lead_per_funnel UNIQUE (lead_id, funnel_id);`
- Limpar duplicatas existentes antes de aplicar
- Trocar `INSERT` por `INSERT ... ON CONFLICT DO NOTHING` na RPC

**2. Melhorar visibilidade no Kanban** (KanbanBoard.tsx)
- Quando um lead **já tem vendedora atribuída**, só essa vendedora o vê (já funciona assim)
- Adicionar invalidação de cache quando `assigned_to` muda, via subscription Supabase Realtime ou refetch mais frequente

**3. SQL de limpeza de duplicatas**
- Script para identificar e remover posições duplicadas mantendo apenas a mais antiga

### Arquivos alterados
- `KanbanBoard.tsx` — ajustar filtro + adicionar realtime subscription
- `docs/sql/unique-lead-stage-positions.sql` — migration com cleanup + constraint
- `docs/sql/alter-sync-lead-add-purchased-at.sql` — documentar uso de `ON CONFLICT`

