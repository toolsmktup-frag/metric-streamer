

## Análise: Recontato não atualiza após nova compra

### Problema identificado

O sistema inteiro de recontato usa a **primeira data de compra** (`firstPurchaseDate`) para calcular o countdown. Isso significa que quando a Maria Helena comprou novamente (ex: "3 potes SuperVITA" em 02/04/26), o prazo de recontato **não resetou** — ele continua contando desde a compra mais antiga (26/06/2023).

Isso afeta 3 pontos:

1. **Frontend** (`useRecontactDeadlines.ts`): usa `firstPurchaseDate` do purchaseMap
2. **Frontend** (`useBulkLeadPurchases.ts`): a RPC `get_bulk_purchase_summaries` só retorna `first_purchase_date`
3. **Cron** (`recontact-cron/index.ts`): busca compras ordenadas ASC e pega a primeira

### Sobre a pergunta "somar os dias?"

Não faz sentido somar os dias de recontato de múltiplos produtos. O correto é: **cada nova compra reseta o countdown**. Se o cliente comprou um produto de 90 dias, o prazo começa a contar da data da compra mais recente. Se ele compra de novo antes de vencer, o prazo recomeça.

### Plano de correção

**1. Alterar a RPC `get_bulk_purchase_summaries`** (migration SQL)
- Adicionar campo `last_purchase_date` (MAX ao invés de MIN) no retorno

**2. Atualizar `useBulkLeadPurchases.ts`**
- Adicionar `lastPurchaseDate` ao `PurchaseSummary`
- Mapear o novo campo da RPC

**3. Atualizar `useRecontactDeadlines.ts`**
- Trocar `firstPurchaseDate` por `lastPurchaseDate` como fonte de data para o cálculo de recontato
- Também priorizar `metadata.purchased_at` (que já vem da última transação via sync_lead_from_sale)

**4. Atualizar `recontact-cron/index.ts`**
- Mudar a query de `order("purchased_at", ascending: true)` para `ascending: false`
- Renomear para `lastPurchaseMap` — pegar a compra mais recente de cada lead

**5. Card do Kanban** (`LeadCard.tsx`)
- O badge "Xd" que mostra dias desde a primeira compra permanece (é o LTV lifetime), mas o recontato usa a data mais recente

### Resumo técnico

A mudança central é: **recontato = data da ÚLTIMA compra + recontact_days**, não da primeira. Isso garante que cada recompra reinicia o ciclo de recontato automaticamente.

