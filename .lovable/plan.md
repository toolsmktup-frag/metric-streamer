

## Diagnóstico: Por que o Resumo do Guia de Tinturas não mostra dados

### Causa raiz

A view `v_all_sales` no banco de dados **não possui a coluna `ingestion_type`**. O código do `FunilResumo.tsx` (linha 44-45) chama:

```
useAllSalesAggregation(id, 'webhook', funnelProducts)
useAllSales(id, 'webhook')
```

Que internamente faz `.eq('ingestion_type', 'webhook')`. Como a coluna não existe na view, a query retorna erro/vazio.

As colunas `ingestion_type`, `product_id`, `affiliate_name`, `affiliate_commission` e a view atualizada estão definidas em arquivos `docs/` (nunca foram migradas):
- `docs/stabilize-webhook-pipeline.sql` -- adiciona colunas na tabela
- `docs/enrich-v-all-sales.sql` -- recria a view com `ingestion_type`
- `docs/add-affiliate-name.sql` -- view final com affiliate + product_id

### Solução

**Passo 1 -- Criar migration que adiciona colunas faltantes nas tabelas**

Arquivo: `supabase/migrations/TIMESTAMP_add_missing_columns_and_view.sql`

- `ALTER TABLE ticto_transactions ADD COLUMN IF NOT EXISTS source_platform text DEFAULT 'ticto'`
- `ALTER TABLE ticto_transactions ADD COLUMN IF NOT EXISTS ingestion_type text DEFAULT 'webhook'`
- `ALTER TABLE ticto_transactions ADD COLUMN IF NOT EXISTS affiliate_name text`
- `ALTER TABLE ticto_transactions ADD COLUMN IF NOT EXISTS affiliate_commission numeric`
- Mesmas colunas em `customer_purchases`

**Passo 2 -- Recriar a view `v_all_sales` com todas as colunas**

Incluir: `product_id`, `ingestion_type`, `affiliate_name`, `affiliate_commission`, `customer_phone`, `unified_customer_id` -- conforme definido em `docs/add-affiliate-name.sql`.

**Passo 3 -- GRANT SELECT**

```sql
GRANT SELECT ON public.v_all_sales TO authenticated;
GRANT SELECT ON public.v_all_sales TO service_role;
```

### Resultado

Após aplicar a migration, a query `v_all_sales` com filtro `ingestion_type = 'webhook'` funcionará e o Resumo do Guia de Tinturas exibirá as vendas corretamente.

### Nota

Você provavelmente já rodou esses SQLs manualmente no Supabase Dashboard em algum momento (já que outros funis funcionam). Se esse for o caso, o problema pode ser diferente -- rode esta query de diagnóstico no SQL Editor para confirmar:

```sql
SELECT column_name FROM information_schema.columns 
WHERE table_name = 'v_all_sales' ORDER BY ordinal_position;
```

Se `ingestion_type` já existir na view, o problema é outro (provavelmente `order_date` NULL nos registros recentes, fazendo com que `purchased_at` seja NULL e o filtro de datas exclua esses registros).

