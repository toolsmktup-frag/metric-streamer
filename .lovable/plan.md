

# Recontato baseado na compra mais recente

## Mudanca

Atualmente o sistema conta o prazo de recontato a partir da **primeira compra**. A proposta e contar a partir da **compra mais recente** e somar os `recontact_days` dos produtos adquiridos.

Exemplo: Lead comprou Produto A (90d) em Jan e Produto B (180d) em Mar.
- **Antes**: 90 + 180 = 270 dias contados de Jan
- **Depois**: 90 + 180 = 270 dias contados de Mar (data mais recente)

## Arquivos alterados

### 1. `src/hooks/useBulkLeadPurchaseProducts.ts`
- Adicionar `created_at` ao SELECT dos eventos
- Retornar `Map<string, { productNames: string[], lastPurchaseDate: string }>` em vez de `Map<string, string[]>`
- Rastrear a data mais recente entre todos os eventos de compra

### 2. `src/hooks/useRecontactDeadlines.ts`
- Usar `lastPurchaseDate` do novo mapa como fonte prioritaria de data
- Fallback: `metadata.purchased_at` → `purchaseMap.firstPurchaseDate`
- Atualizar tipos e comentarios

### 3. `supabase/functions/recontact-cron/index.ts`
- Na construcao do `leadPurchaseInfo`, rastrear `lastDate` alem de `firstDate`
- Usar `lastDate` para calcular o deadline em vez de `firstDate`

### 4. `src/pages/LeadFunnelDetail.tsx`
- Ajustar tipagem do retorno de `useBulkLeadPurchaseProducts` (desestruturacao)

## Impacto

- Leads com multiplas compras ganham mais tempo antes de serem marcados como "vencidos"
- O cron tambem respeitara a data mais recente, evitando mover leads prematuramente
- Sem impacto em leads com apenas 1 compra (first = last)

