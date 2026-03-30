

## Plano: Corrigir upsert do webhook Ticto + atribuição de campanhas

### Problema
1. O upsert faz `onConflict: "order_id,product_id"` mas o banco tem apenas um **índice parcial** (`WHERE NOT NULL`). PostgREST não aceita índices parciais para ON CONFLICT — erro: "no unique or exclusion constraint matching".
2. Campanhas Meta ainda estão mal atribuídas (precisa rodar o SQL de fix).

### Mudanças

**1. `supabase/functions/ticto-webhook/index.ts` — Trocar upsert por select+insert/update manual**

Em vez de `.upsert(record, { onConflict: "order_id,product_id" })`, fazer:
- Se `order_id` e `product_id` existem: buscar registro existente com `.select().eq("order_id", X).eq("product_id", Y).maybeSingle()`
  - Se encontrou: `.update(record).eq("id", existing.id)`
  - Se não: `.insert(record)`
- Se `order_id` ou `product_id` é null: tentar upsert por `transaction_hash` (constraint original que existe no banco)

**2. SQL para rodar no Supabase (campanhas) — sem mudança, continua o mesmo**
O SQL que te passei antes para resetar campanhas e re-executar `auto_assign_campaign_funnels()` continua necessário e válido. Rode após o deploy do webhook.

### Resultado
- Webhook para de dar erro 500
- Vendas Ticto do Guia de Tinturas entram com dados completos (product_name, paid_amount, funnel_id)
- Dashboard do funil passa a mostrar vendas

