

## Recontato: Soma linear de dias por produto

**Lógica implementada**: Quando um lead tem múltiplas compras no mesmo funil, os `recontact_days` de cada produto são SOMADOS e contados a partir da primeira data de compra.

**Exemplo**: Produto A (90d) + Produto B (180d) = 270 dias a partir da primeira compra.

### Arquivos alterados

1. **`src/hooks/useBulkLeadPurchaseProducts.ts`** (NOVO)
   - Busca todos os eventos de compra (`lead_events`) por lead no funil
   - Retorna `Map<leadId, product_name[]>` com todos os produtos comprados

2. **`src/hooks/useRecontactDeadlines.ts`**
   - Aceita novo param `leadProductNamesMap`
   - Para cada lead, matcha TODOS os produtos e SOMA os recontact_days
   - Deadline = firstPurchaseDate + SUM(recontact_days)

3. **`src/pages/LeadFunnelDetail.tsx`**
   - Conecta o novo hook `useBulkLeadPurchaseProducts`

4. **`supabase/functions/recontact-cron/index.ts`**
   - Busca eventos de compra via `lead_events` (não mais `customer_purchases`)
   - Soma recontact_days de todos os produtos matchados por lead
