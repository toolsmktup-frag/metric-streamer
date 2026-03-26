

## Plano: Separar webhook vs import nos dashboards

SQL já foi rodado. Agora preciso atualizar 4 arquivos no código:

### 1. `src/hooks/useAllSales.ts`
- Adicionar `ingestion_type: string` ao tipo `UnifiedSale`
- Na função `fetchAllSalesRows`, quando `funnelId` estiver presente, adicionar `.eq('ingestion_type', 'webhook')` na query

### 2. `supabase/functions/import-ticto-csv/index.ts`
- Adicionar `ingestion_type: 'import'` no objeto de cada registro em `dbRecords` (linha ~83)

### 3. `supabase/functions/process-import/index.ts`
- Adicionar `ingestion_type: 'import'` no `cpRecords.push` (linha ~236)
- Adicionar `ingestion_type: 'import'` no `ttRecords.push` (linha ~268)

### 4. `docs/enrich-v-all-sales.sql`
- Atualizar a documentação da view com a coluna `ingestion_type`

### Resultado
- Dashboard de funil: só vendas de webhook (tráfego real)
- Base de leads/inteligência: tudo (webhook + import)
- Futuras importações: automaticamente marcadas como `'import'`

