
## Plano: Baixa Automática de Estoque via Webhooks

### Situação atual
- ✅ Tabela `product_offer_mappings` existe (offer_name → product_id + quantity)
- ✅ UI de mapeamento de ofertas funciona (aba Produtos > Ofertas)
- ✅ `physical_products` tem campos `current_stock`, `stock_potes`, `stock_etiquetas`
- ✅ `inventory_movements` registra movimentações
- ❌ **Nenhum webhook deduz estoque automaticamente** — os mappings existem mas não são usados

### Solução
Criar uma Edge Function `stock-deductor` que:
1. Recebe `product_name` e `platform` de cada webhook
2. Busca match em `product_offer_mappings` (case-insensitive)
3. Deduz `current_stock`, `stock_potes` e `stock_etiquetas` pelo `quantity` mapeado
4. Registra em `inventory_movements` (type='out', source='webhook')

### Chamada nos webhooks
Adicionar no final de cada webhook (ticto, guru, eduzz) um `await fetch()` para `stock-deductor` com o `product_name` da venda **apenas quando status = authorized**.

### Arquivos
1. **`supabase/functions/stock-deductor/index.ts`** — nova Edge Function
2. **`supabase/functions/ticto-webhook/index.ts`** — adicionar forward para stock-deductor
3. **`supabase/functions/guru-webhook/index.ts`** — idem
4. **`supabase/functions/eduzz-webhook/index.ts`** — idem

### Resultado
Toda venda aprovada que tiver um mapeamento de oferta configurado vai automaticamente deduzir do estoque os 3 itens (produto acabado, potes, etiquetas).
