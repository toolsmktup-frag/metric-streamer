

## Corrigir recontato: adicionar `autorizado`, buscar produtos de `lead_events`, remover fallback incorreto

### O que muda

**1. Adicionar `autorizado` ao filtro de eventos de compra** (2 arquivos)
- `src/hooks/useBulkLeadPurchaseProducts.ts` linha 38: `['purchase', 'Purchase', 'pago', 'authorized']` → `['purchase', 'Purchase', 'pago', 'authorized', 'autorizado']`
- `supabase/functions/recontact-cron/index.ts` linha 72: mesma adição

**2. `useDistinctLeadProducts` buscar de `lead_events` em vez de `metadata`**
- Em `src/hooks/useLeadProductMappings.ts`, alterar a query para buscar `product_name` dos `lead_events` de compra dos leads do funil, ao invés de só o campo `metadata.product_name` do lead (que mostra apenas 1 produto)

**3. Remover fallback `totalOrders * recontact_days`**
- Em `src/hooks/useRecontactDeadlines.ts` linhas 106-127: o fallback que multiplica `recontact_days * totalOrders` quando não encontra produtos é incorreto — deve ser removido. Se não tem produtos, não calcula recontato.

**4. Adicionar logs de debug temporários**
- Em `useRecontactDeadlines.ts`: log por lead mostrando produtos encontrados, quantos matcharam, total de dias

### Nada a rodar no Supabase

Não precisa rodar nenhuma migration ou SQL. Todas as tabelas já existem (`lead_events`, `lead_product_mappings`, `lead_funnel_products`).

### Arquivos editados

- `src/hooks/useBulkLeadPurchaseProducts.ts`
- `supabase/functions/recontact-cron/index.ts`
- `src/hooks/useLeadProductMappings.ts`
- `src/hooks/useRecontactDeadlines.ts`

