
## Diagnostico completo: Funil Guia de Tinturas (Ticto) nao puxa dados

### Raiz do problema

O ArticulaBEM funciona porque usa o **webhook Guru**, que parseia corretamente e salva `product_name`, `revenue` e `funnel_id` via `resolve_funnel_id`. 

O Guia de Tinturas usa **Ticto**, e tem **3 problemas encadeados**:

**Problema 1 — Webhook Ticto nao extrai dados do payload**
O parser tenta multiplos caminhos (`order.paid_amount`, `invoice.paid_amount`, `item.amount`, etc.) mas o payload real da Ticto nao bate com nenhum. Resultado: `paid_amount=0`, `product_name=""`. O `raw_payload` esta salvo corretamente — os dados existem, mas nao sao extraidos.

**Problema 2 — Sem product_name, resolve_funnel_id falha**
O webhook chama `resolve_funnel_id(productName)` para atribuir o funil, mas como `productName=""`, nunca matcha com `funnel_products` (que espera "TINTURA", "CHA", "MESTRE"). Resultado: `funnel_id=null`.

**Problema 3 — Campanhas atribuidas errado**
O `auto_assign_campaign_funnels` tem keywords muito genericas. Como o Guia de Tinturas era o unico funil inicialmente, TODAS as campanhas (incluindo ArticulaBEM) receberam `funnel_id = 10000000-...`. Isso nao atrapalha o ArticulaBEM (que usa Guru com funnel_id proprio), mas polui os gastos Meta do Guia de Tinturas com campanhas que nao sao dele.

### Plano de correcao (4 passos)

**Passo 1 — Descobrir a estrutura real do payload Ticto**
Voce precisa rodar no SQL Editor do Supabase:
```sql
SELECT 
  id,
  raw_payload->'data' AS data_level,
  jsonb_object_keys(COALESCE(raw_payload->'data', '{}'::jsonb)) AS data_keys
FROM ticto_transactions
WHERE product_name = '' OR product_name IS NULL
LIMIT 3;
```
Com isso, vamos ver exatamente onde estao `paid_amount` e `product_name` no payload e ajustar o parser do webhook.

**Passo 2 — Corrigir o webhook Ticto (Edge Function)**
Apos identificar a estrutura real, ajustar `extractPaidAmountCents()` e `extractProductName()` para incluir o caminho correto. Provavelmente e algo como `payload.data.sale.paid_amount` ou `payload.data.product.name` que nao esta nos candidatos atuais.

**Passo 3 — Backfill: corrigir transacoes historicas**
Rodar SQL no Supabase para extrair dados do `raw_payload` e popular `paid_amount`, `product_name` e `funnel_id` nos registros existentes. O script ja existe em `docs/backfill-guia-tinturas.sql`, mas precisa ser ajustado com os caminhos corretos do Passo 1.

Apos o backfill de product_name, rodar:
```sql
SELECT public.tag_historical_transactions();
```
Para atribuir `funnel_id` via `resolve_funnel_id` em todas as transacoes que agora tem product_name preenchido.

**Passo 4 — Corrigir atribuicao de campanhas Meta**
```sql
-- Resetar campanhas ArticulaBEM atribuidas errado ao Guia de Tinturas
UPDATE meta_campaigns SET funnel_id = NULL
WHERE funnel_id = '10000000-0000-0000-0000-000000000001'
  AND name ILIKE '%articulabem%';

-- Idem para adsets e ads
UPDATE meta_adsets SET funnel_id = NULL WHERE funnel_id = '10000000-0000-0000-0000-000000000001';
UPDATE meta_ads SET funnel_id = NULL WHERE funnel_id = '10000000-0000-0000-0000-000000000001';

-- Re-executar auto_assign (agora com ArticulaBEM como funil separado)
SELECT auto_assign_campaign_funnels();
```

### Proximo passo imediato

Preciso que voce rode o SQL do **Passo 1** no Supabase e me mande o resultado. Com a estrutura real do payload, consigo ajustar o webhook e o backfill de uma vez.
