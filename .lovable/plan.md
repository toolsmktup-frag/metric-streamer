

# Fix: Eventos duplicados cross-pipeline (guru-webhook + wz-receiver)

## Problema

Quando um webhook Guru dispara, ele chega em **duas Edge Functions** simultaneamente:
1. `guru-webhook` — extrai `transaction_id` como `sale.transaction_id || payment.marketplace_id || sale.id`
2. `wz-receiver` — extrai como `body.id || paymentObj.marketplace_id || body.transaction_id`

A **ordem de extração é diferente**, então o mesmo payload pode gerar `transaction_id` distintos. O índice único `ux_lead_events_txn_dedup` não impede a duplicata porque os IDs são diferentes.

Resultado: 2-3 eventos para a mesma compra (como visto na Luzia e na Maria De Lourdes).

## Solução

### 1. Unificar extração de `transaction_id` no wz-receiver (normalizeGuru)

Alinhar a ordem de extração do `external_event_id` no `normalizeGuru` do wz-receiver para ser **idêntica** à do guru-webhook:

```
// ANTES (wz-receiver)
body.id || paymentObj.marketplace_id || body.transaction_id

// DEPOIS (wz-receiver) — mesma ordem do guru-webhook
sale.transaction_id || payment.marketplace_id || sale.id || body.id || sale.order_id
```

Onde `sale = body.sale || body` e `payment = body.payment || {}`.

### 2. Cleanup: remover duplicatas existentes da lead_events

SQL para limpar duplicatas históricas — manter apenas o evento mais antigo por `(lead_id, funnel_id, event_name)` quando o `metadata->>'product_name'` é igual:

```sql
DELETE FROM lead_events
WHERE id IN (
  SELECT id FROM (
    SELECT id,
      ROW_NUMBER() OVER (
        PARTITION BY lead_id, funnel_id, event_name, 
          COALESCE(metadata->>'product_name', ''),
          DATE_TRUNC('minute', created_at)
        ORDER BY created_at ASC
      ) AS rn
    FROM lead_events
  ) ranked
  WHERE rn > 1
);
```

Este cleanup agrupa eventos que são do mesmo lead, mesmo funil, mesmo event_name, mesmo product_name, e aconteceram no mesmo minuto — mantém o primeiro e remove os demais.

### 3. Gerar TXT consolidado

Gerar arquivo com:
- SQL de cleanup
- Código atualizado do wz-receiver para redeploy

## Arquivos a alterar

1. `supabase/functions/wz-receiver/index.ts` — alinhar `normalizeGuru.external_event_id`
2. Gerar SQL de cleanup + TXT para deploy

## Impacto

- Novos webhooks Guru geram apenas 1 evento (mesmo `transaction_id` em ambos pipelines)
- Dados históricos ficam limpos
- Sem impacto em Ticto/Eduzz (não passam pelo guru-webhook)

