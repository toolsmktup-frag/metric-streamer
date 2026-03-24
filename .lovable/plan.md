

# Auditoria Pre-Importacao: Bugs e Riscos Identificados

Revisei todo o fluxo de importacao (frontend Importar.tsx, edge function process-import, view v_all_sales, hooks de leitura). Encontrei **4 problemas reais** que vao impactar a importacao de 50k+ registros.

---

## BUG 1 (Critico): funnel_id nao e atribuido na importacao

O `process-import` insere em `ticto_transactions` mas **nunca define `funnel_id`**. Resultado: todas as vendas importadas ficam com `funnel_id = NULL`. A pagina de resumo do funil (`/funis/.../resumo`) filtra por `funnel_id`, entao **nenhuma venda importada aparece nos funis**.

**Correcao:** Resolver o `funnel_id` no `process-import` usando a mesma logica do webhook (token ou `resolve_funnel_id` por product_name).

---

## BUG 2 (Critico): Performance vai travar com 50k registros

O fluxo atual para **cada registro** faz:
- 1 RPC `resolve_or_create_customer`
- 1 INSERT `customer_purchases`
- 1 INSERT `ticto_transactions`
- 1 RPC `sync_lead_from_sale`

Sao **4 chamadas ao banco por registro**. Com batch de 50, sao 200 chamadas por batch. Com 50k registros = **1000 batches x 200 chamadas = 200.000 operacoes**. Edge functions tem timeout de ~60s. Cada batch vai levar 5-10s. Total estimado: **~3-5 horas** de importacao sequencial, com risco de timeout em batches grandes.

**Correcao:** Aumentar batch para 200-500 e/ou converter inserts individuais para bulk inserts. Considerar processar `sync_lead_from_sale` em background (nao bloquear o insert).

---

## BUG 3 (Moderado): usePrevPeriodAllSales nao pagina

O hook `usePrevPeriodAllSales` faz uma unica query sem paginacao. Supabase retorna no maximo 1000 linhas. Depois da importacao, o periodo anterior pode ter mais de 1000 vendas, e os dados de comparacao ficarao incompletos/errados.

**Correcao:** Reutilizar `fetchAllSalesRows` (que ja faz loop de paginacao) no `usePrevPeriodAllSales`.

---

## BUG 4 (Menor): Eduzz importada aparece como "ticto" na v_all_sales

A view `v_all_sales` rotula tudo de `ticto_transactions` como `'ticto'::text AS platform`. Vendas Eduzz importadas via CSV vao para `ticto_transactions` e aparecem como plataforma "ticto" nos dashboards.

**Correcao:** Adicionar coluna `platform` em `ticto_transactions` (ou usar a existente se houver) e refletir na view.

---

## Plano de Implementacao

### Passo 1 — Resolver funnel_id no process-import
- Adicionar chamada RPC `resolve_funnel_id(product_name)` no loop de processamento
- Setar `funnel_id` no insert de `ticto_transactions` e `customer_purchases`

### Passo 2 — Otimizar performance para escala
- Aumentar BATCH de 50 para 250
- Converter inserts individuais para bulk inserts (array de objetos)
- Tornar `sync_lead_from_sale` nao-bloqueante (fire-and-forget)
- Adicionar timeout handling no frontend

### Passo 3 — Corrigir paginacao do periodo anterior
- Refatorar `usePrevPeriodAllSales` para usar `fetchAllSalesRows`

### Passo 4 — Corrigir label de plataforma na view
- Usar campo `organization_id` ou adicionar campo `source_platform` em `ticto_transactions`
- Atualizar a view `v_all_sales` para refletir a plataforma real

---

## Detalhes Tecnicos

| Arquivo | Problema |
|---|---|
| `supabase/functions/process-import/index.ts` | Sem funnel_id, inserts individuais lentos |
| `src/hooks/useAllSales.ts:154-181` | usePrevPeriodAllSales sem paginacao |
| `docs/enrich-v-all-sales.sql` | Platform hardcoded como 'ticto' |
| `src/pages/Importar.tsx:341` | BATCH=50 muito pequeno para 50k |

