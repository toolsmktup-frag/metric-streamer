
Diagnóstico rápido

- `0` nesse SQL ainda não prova que “não existe histórico”; ele só prova que hoje não há linhas que casem com:
  1. `funnel_id = '10000000-0000-0000-0000-000000000001'`
  2. `ingestion_type = 'webhook'`
- Pelo código:
  - importações entram como `import` (`supabase/functions/import-ticto-csv/index.ts`, `supabase/functions/process-import/index.ts`)
  - eventos do webhook agora entram como `webhook` (`supabase/functions/ticto-webhook/index.ts`)
  - o dashboard do funil de tráfego mostra só `webhook` (`src/pages/FunilResumo.tsx`)
- Então a retroativa só aparece se houver linhas que realmente passaram pelo webhook e ficaram salvas com evidência. Importação antiga não vira `webhook` sozinha.

Principal suspeita

- O `funnel_id` usado na query pode estar errado.
- No código, a URL do webhook sempre usa o token do funil atual (`src/pages/FunisConfigurar.tsx`), e o `10000000-...0001` é só o ID do seed inicial da migration (`supabase/migrations/20260313120000_multi_funnel_foundation.sql`), não garantia de que seja o funil real ativo hoje.
- Inclusive, o preview atual está em `/funis/configurar?editar=b253f262-44ac-4c64-8c4e-2e9fa0f9146e`, o que reforça que pode existir um funil real com outro ID.

Plano de validação

1. Confirmar qual `funnel_id` esse token resolve hoje
2. Contar as transações do funil real por `ingestion_type`
3. Ver se existem linhas com `raw_payload` nesse funil
4. Ver as últimas linhas criadas hoje
5. Só depois decidir se falta novo backfill ou se nenhum evento novo foi salvo

SQLs para validar agora

```sql
-- 1) Descobrir o funil real desse token
SELECT id, name, webhook_token
FROM funnels
WHERE webhook_token = '3c3ff98e-f347-40b2-a0e0-cdb899c935d5';
```

```sql
-- 2) Resumo por origem no funil real
SELECT
  funnel_id,
  ingestion_type,
  COUNT(*) AS total
FROM ticto_transactions
WHERE funnel_id = '<ID_REAL_DO_FUNIL>'
GROUP BY funnel_id, ingestion_type
ORDER BY ingestion_type;
```

```sql
-- 3) Ver se há evidência de webhook salva
SELECT COUNT(*) AS com_raw_payload
FROM ticto_transactions
WHERE funnel_id = '<ID_REAL_DO_FUNIL>'
  AND raw_payload IS NOT NULL;
```

```sql
-- 4) Ver as últimas linhas, inclusive de hoje
SELECT
  created_at,
  updated_at,
  status,
  ingestion_type,
  order_id,
  product_name,
  paid_amount,
  raw_payload IS NOT NULL AS has_raw_payload
FROM ticto_transactions
WHERE funnel_id = '<ID_REAL_DO_FUNIL>'
ORDER BY created_at DESC
LIMIT 20;
```

Leitura prática do resultado

- Se o passo 1 devolver outro `id`, o `COUNT = 0` estava “certo”, mas a query estava olhando o funil errado.
- Se o passo 2 mostrar só `import`, então não existe ainda linha classificada como `webhook` nesse funil.
- Se o passo 3 der `0`, não há rastro salvo de webhook para fazer retroativa segura.
- Se o passo 4 não mostrar nenhuma linha nova de hoje, então desde o redeploy nenhum evento novo foi persistido nesse funil.

Resposta direta à sua dúvida

- “Retroativa”: só existe para registros que tenham evidência real de webhook salva.
- “Inclusive de hoje”: se já entrou qualquer evento novo depois do redeploy, deveria existir pelo menos 1 linha `webhook`. Se continua `0`, o cenário mais provável é:
  - query usando o `funnel_id` errado, ou
  - nenhum evento novo foi salvo nesse funil desde o redeploy.
