
## Plano: estabilizar o webhook do Guia de Tinturas e alinhar o Supabase

### O que identifiquei
- O `ticto-webhook` grava em `webhook_audit` antes de salvar a venda. Se essa tabela continua vazia, o gargalo está antes do CRM e antes do `wz-receiver`.
- O código atual do `ticto-webhook` usa colunas que não aparecem nas migrations/tipos gerados do projeto, como `source_platform`, `ingestion_type`, `affiliate_name` e `affiliate_commission`. Isso indica drift entre Edge Function e schema real.
- O resumo do funil lê `v_all_sales` filtrando `ingestion_type = 'webhook'`. Então não basta salvar a venda: a view e as colunas precisam estar consistentes.
- Deploy de Edge Function não retroprocessa vendas antigas. Para histórico aparecer no funil, precisa backfill.

### Do I know what the issue is?
Sim: o problema principal está no pipeline do `ticto-webhook`/banco, não no `wz-receiver`. O cenário mais provável é:
1. a Ticto não enviou nenhum evento novo após o deploy; ou
2. o evento chegou, mas o schema do Supabase está desalinhado com o código e a gravação falhou.

### Plano de implementação
1. **Formalizar o schema faltante em migration**
   - Garantir no banco:
     - `ticto_transactions`: `funnel_id`, `source_platform`, `ingestion_type`, `affiliate_name`, `affiliate_commission`
     - `customer_purchases`: `ingestion_type`, `affiliate_name`, `affiliate_commission`
     - `webhook_audit` com as colunas usadas pela função
   - Recriar/atualizar `v_all_sales` para expor exatamente os campos consumidos pelo frontend.

2. **Endurecer o `ticto-webhook`**
   - Manter uma auditoria mínima que sempre consiga persistir.
   - Melhorar o tratamento de erro quando houver coluna ausente ou falha de insert.
   - Garantir a resolução do `funnel_id` por token e fallback por `resolve_funnel_id(product_name)`.

3. **Separar “evento novo” de “histórico”**
   - Evento novo: validar que um teste da Ticto gera linha em `webhook_audit` e em `ticto_transactions`.
   - Histórico: aplicar o backfill já documentado (`tag_historical_transactions()` e, se necessário, o SQL de `docs/fix-guia-tinturas-pipeline.sql`).

4. **Validar CRM e automações só depois da venda existir**
   - `sync_lead_from_sale` deve rodar apenas quando a venda estiver `authorized`.
   - `wz-receiver` deve receber o forward e criar `wz_executions` só para flows ativos compatíveis.

5. **Alinhar contratos do projeto**
   - Atualizar os tipos gerados do Supabase para refletir o schema real e evitar novas divergências entre frontend, funções e banco.

### Validação esperada
- Após um novo teste da Ticto:
  1. aparece linha em `webhook_audit`
  2. aparece/atualiza linha em `ticto_transactions`
  3. a venda entra em `v_all_sales` com `funnel_id` do Guia de Tinturas
  4. o `/funis/10000000-0000-0000-0000-000000000001/resumo` deixa de mostrar receita zerada
  5. se o status for aprovado, o lead entra no CRM e a automação pode disparar
- Para vendas antigas, o funil só atualiza depois do backfill; deploy sozinho não basta.

### Detalhes técnicos
- Arquivos centrais:
  - `supabase/functions/ticto-webhook/index.ts`
  - `supabase/functions/wz-receiver/index.ts`
  - `src/hooks/useAllSales.ts`
  - `src/pages/FunilResumo.tsx`
  - `src/integrations/supabase/types.ts`
- SQLs de referência já existentes:
  - `docs/enrich-v-all-sales.sql`
  - `docs/add-affiliate-name.sql`
  - `docs/fix-guia-tinturas-pipeline.sql`
  - `supabase/migrations/20260313120000_multi_funnel_foundation.sql`
- Risco atual: a função já pressupõe colunas que não estão refletidas nas migrations/tipos do repositório, o que explica falhas silenciosas e inconsistência no dashboard.
