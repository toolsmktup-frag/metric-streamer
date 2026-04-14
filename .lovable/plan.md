

# Auditoria de Deduplicacao e Recontato

## Status Atual

Todas as 3 plataformas de webhook (Guru, Ticto, Eduzz) e o wz-receiver ja passam `transaction_id` no metadata — OK.

Os hooks de frontend (`useBulkLeadPurchaseProducts` e `useRecontactDeadlines`) ja filtram por `funnel_id` e usam `lastPurchaseDate` — OK.

O cron (`recontact-cron`) ja usa `lastDate` e filtra por `funnel_id` — OK.

## Problemas Encontrados

### 1. `process-import/index.ts` — SEM transaction_id no metadata
A funcao de importacao de planilhas nao inclui `transaction_id`. Se o usuario reimportar a mesma planilha, vai duplicar eventos.

**Fix**: Adicionar `transaction_id: record.platform_transaction_id || record.order_id || null` ao `p_metadata`.

### 2. `import-ticto-csv/index.ts` — SEM transaction_id no metadata
Mesmo problema. Importacao de CSV da Ticto nao inclui `transaction_id`.

**Fix**: Adicionar `transaction_id: rec.platform_transaction_id || rec.order_hash || null` ao `p_metadata`.

## Arquivos a alterar

1. `supabase/functions/process-import/index.ts` — adicionar transaction_id ao p_metadata
2. `supabase/functions/import-ticto-csv/index.ts` — adicionar transaction_id ao p_metadata

## Impacto

- Importacoes futuras de planilhas ficam idempotentes (reimportar nao duplica)
- Webhooks ja estao protegidos (nenhuma mudanca necessaria)
- Frontend e cron ja estao corretos

