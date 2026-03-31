

## Problema identificado

O webhook Ticto **não inclui `ingestion_type: 'webhook'`** no objeto `record` (linha 265-301 de `ticto-webhook/index.ts`). O campo depende do DEFAULT do banco (`'webhook'`), que funciona para **inserts novos**, mas:

1. **Updates em registros importados** — quando o webhook recebe um evento para um `order_id + product_id` que já existe como `import`, ele faz `update` sem alterar `ingestion_type` → continua `'import'`
2. **O dashboard não filtra por `ingestion_type`** — `useAllSales` e `useAllSalesAggregation` puxam tudo do funil sem distinguir webhook vs import

Como todas as 54k transações do Guia de Tinturas foram importadas antes, qualquer evento novo do webhook encontra o registro e faz update, mantendo `ingestion_type = 'import'`.

## Correções necessárias

### 1. Edge Function `ticto-webhook/index.ts`
- Adicionar `ingestion_type: 'webhook'` no objeto `record` (após `updated_at`)
- Adicionar `source_platform: 'ticto'` para garantir consistência com a view

### 2. SQL: marcar transações que vieram por webhook (backfill)
- Transações que têm `raw_payload` com dados reais do webhook (ex: contêm `tracking`, `customer`, etc.) mas estão como `import` devem ser re-marcadas
- Query para identificar e atualizar:
```sql
UPDATE ticto_transactions
SET ingestion_type = 'webhook'
WHERE funnel_id = '10000000-0000-0000-0000-000000000001'
  AND raw_payload IS NOT NULL
  AND raw_payload::text != '{}'
  AND (raw_payload->'tracking' IS NOT NULL 
       OR raw_payload->'customer' IS NOT NULL
       OR raw_payload->'data' IS NOT NULL);
```

### 3. Frontend: filtrar por `ingestion_type` no funil de tráfego
- Em `useAllSales`, adicionar parâmetro opcional `ingestionType`
- Quando passado, adicionar `.eq('ingestion_type', ingestionType)` na query
- Em `FunilResumo.tsx`, passar `ingestionType: 'webhook'` para mostrar apenas vendas reais do webhook

### Arquivos a editar
| Arquivo | Mudança |
|---------|---------|
| `supabase/functions/ticto-webhook/index.ts` | Adicionar `ingestion_type: 'webhook'` ao record |
| `src/hooks/useAllSales.ts` | Parâmetro `ingestionType` opcional no fetch |
| `src/pages/FunilResumo.tsx` | Passar `'webhook'` como filtro de ingestion |
| SQL (manual no Supabase) | Backfill de transações que vieram por webhook |

### Resultado
- Novas vendas via webhook ficam marcadas como `'webhook'`
- Dashboard de tráfego mostra **apenas** vendas reais do webhook
- Funil de leads continua mostrando tudo (sem filtro)
- Articulabem não é afetado

