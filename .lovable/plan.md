

# Fix: Timeline duplicada mesmo com compras corretas

## Problema

A lead **Luzia Helena** mostra 2 eventos "Compra: 1 pote ArticulaBEM" com timestamp **idêntico** (18/12/2025 09:57:39) na timeline, mas as compras estão corretas (sem duplicata).

## Causa raiz

O `guru-webhook` faz **duas chamadas** ao `sync_lead_from_sale` para cada webhook Guru:

1. **Linha 93-108**: Encaminha o payload inteiro para `wz-receiver`, que por sua vez chama `sync_lead_from_sale`
2. **Linha 340-373**: Chama `sync_lead_from_sale` diretamente

As duas chamadas usam o mesmo `event_name` ("purchase") e o mesmo `transaction_id`, então o índice único `ux_lead_events_txn_dedup` (v7) deveria bloquear a segunda. Porém, **a RPC v7 provavelmente não está deployed** — o que está rodando ainda é a v4/v5/v6 que não tem `ON CONFLICT DO NOTHING`.

## Solução (2 passos)

### 1. Deploy da RPC v7 (deduplicação race-safe)

Rodar o SQL de `docs/rpc-sync-lead-from-sale-v7.sql` no SQL Editor do Supabase. Isso:
- Cria o índice único parcial `ux_lead_events_txn_dedup` em `(lead_id, funnel_id, event_name, metadata->>'transaction_id')`
- Recria a RPC com `INSERT ... ON CONFLICT DO NOTHING` nos lead_events
- Limpa duplicatas históricas por `transaction_id`

### 2. Cleanup adicional para duplicatas sem transaction_id

Rodar SQL complementar para pegar duplicatas que não tinham `transaction_id` no metadata (eventos antigos):

```sql
DELETE FROM lead_events
WHERE id IN (
  SELECT id FROM (
    SELECT id,
      ROW_NUMBER() OVER (
        PARTITION BY lead_id, funnel_id, event_name,
          COALESCE(metadata->>'product_name', ''),
          created_at
        ORDER BY id ASC
      ) AS rn
    FROM lead_events
  ) ranked
  WHERE rn > 1
);
```

Note: este usa `created_at` **exato** (sem truncar para minuto), pegando duplicatas com timestamp idêntico ao segundo.

## Resultado esperado

- Duplicatas históricas limpas (incluindo Luzia Helena)
- Novos webhooks Guru protegidos pelo índice único — mesmo com duas chamadas ao `sync_lead_from_sale`, apenas 1 evento é inserido
- Sem impacto em Ticto/Eduzz

## Arquivo a gerar

TXT consolidado com:
- SQL da v7 (criação do índice + RPC)
- SQL de cleanup complementar (por `created_at` exato)

