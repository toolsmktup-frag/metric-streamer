

## Filtrar produtos distintos pelo contexto do funil

### Problema
O hook `useDistinctLeadProducts` busca todos os `product_name` de todos os eventos de compra dos leads posicionados neste funil. Porém, um lead pode ter compras de produtos de **outros** funis, e esses nomes aparecem na lista de vinculação sem relevância.

### Solução
Após coletar os nomes distintos dos eventos, filtrar para manter apenas os que correspondem aos produtos configurados neste funil (`lead_funnel_products`). A correspondência usa:
- **product_id** — se o evento tem `product_id` que bate com algum `lead_funnel_products.product_id`
- **product_name_contains** — se o nome do produto contém o fragmento configurado (ILIKE)

### Alteração

**Arquivo**: `src/hooks/useLeadProductMappings.ts` — função `useDistinctLeadProducts`

1. Receber o `funnelId` (já recebe)
2. Buscar os `lead_funnel_products` deste funil (product_id + product_name_contains)
3. Após montar o `Set<string>` de nomes, filtrar mantendo apenas os que:
   - Contêm algum `product_name_contains` (case-insensitive), OU
   - Têm um `product_id` correspondente nos eventos

Isso reduz a lista para apenas os produtos relevantes ao funil, como mostra a imagem do usuário (ex: ArticulaBEM, SuperVITA, etc.).

