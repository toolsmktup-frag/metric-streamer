

## Plano: Capturar URLs de Checkout e Página em Todos os Webhooks

### O que muda

Adicionar duas colunas novas em todas as tabelas de transação para guardar:
- **`checkout_url`** — URL original do checkout da plataforma (onde o cliente fez o pagamento)
- **`page_url`** — página de origem/vendas (de onde o cliente veio antes do checkout)

Isso será extraído dos payloads de **Ticto, Eduzz e Guru** e exposto na view `v_all_sales`.

### Etapas

**1. Migration SQL** — Adicionar colunas nas tabelas e recriar a view
- `ALTER TABLE ticto_transactions ADD COLUMN IF NOT EXISTS checkout_url text, ADD COLUMN IF NOT EXISTS page_url text`
- `ALTER TABLE customer_purchases ADD COLUMN IF NOT EXISTS checkout_url text, ADD COLUMN IF NOT EXISTS page_url text`
- Recriar `v_all_sales` incluindo `checkout_url` e `page_url`

**2. Edge Function: ticto-webhook** — Extrair URLs do payload
- Buscar em caminhos como `tracking.checkout_url`, `query_params.page`, `payload.checkout_url`, `payload.page_url`, `payload.checkout_page`
- Salvar no record antes do insert/update

**3. Edge Function: guru-webhook** — Extrair URLs do payload
- Buscar em `tracking.checkout_url`, `sale.checkout_url`, `queryParams.page`, etc.
- Salvar no `purchaseRecord`

**4. Edge Function: eduzz-webhook** — Extrair URLs do payload
- Buscar em `data.checkout_url`, `tracking.checkout_url`, `invoice.checkout_url`, etc.
- Salvar no `purchaseRecord`

**5. Backfill** — Extrair dos `raw_payload` existentes
- SQL para preencher `checkout_url` e `page_url` retroativamente a partir dos payloads já salvos em `ticto_transactions` e `customer_purchases`

### Detalhes Técnicos

Cada webhook parser terá lógica genérica que tenta múltiplos caminhos JSON:

```text
checkout_url = tracking.checkout_url || payload.checkout_url 
             || payload.checkout_page || sale.checkout_url
             || queryParams.checkout_url

page_url     = tracking.page_url || queryParams.page 
             || payload.page_url || payload.page
```

Como os payloads reais podem ter caminhos diferentes, a query de backfill vai inspecionar o `raw_payload` JSONB para encontrar os valores corretos. Sugiro rodar primeiro uma query diagnóstica no Supabase para identificar os caminhos exatos antes do backfill definitivo.

