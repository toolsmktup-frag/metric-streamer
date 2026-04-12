

## Correção do Cálculo de Recontato (SOMA LINEAR) — Maria Helena -33d

### Problema identificado

A Maria Helena tem 3 compras mas o recontato mostra **-33d** porque existem **2 bugs** na lógica:

**Bug 1 — Data errada (prioridade invertida)**
O código em `useRecontactDeadlines.ts` (linha 97) usa `metadata.purchased_at` como primeira opção de data. Mas o metadata sempre contém a data da **última** transação (por causa do merge JSONB na RPC v5). Para a SOMA LINEAR, precisamos da data da **primeira** compra (`purchaseMap.firstPurchaseDate`). A prioridade está invertida.

**Bug 2 — Lista de produtos incompleta**
O `useBulkLeadPurchaseProducts` busca nomes de produtos apenas na tabela `lead_events`. Compras históricas (como a da Eduzz de 2023) que foram importadas antes do CRM podem não ter eventos registrados. O resultado é que o `leadProductNamesMap` retorna apenas 1-2 produtos em vez dos 3, e a soma dos `recontact_days` fica errada.

### Plano de correção

**1. Inverter prioridade de data em `useRecontactDeadlines.ts`**
- Usar `purchaseMap.firstPurchaseDate` como **primeira** opção (data real da primeira compra)
- Fallback para `metadata.purchased_at` apenas quando purchaseMap não tem dados
- Isso garante que a SOMA LINEAR conte a partir da primeira compra

**2. Enriquecer `useBulkLeadPurchaseProducts.ts` com dados de `customer_purchases`**
- Além de buscar em `lead_events`, também buscar nomes de produtos distintos na tabela `customer_purchases` (via email/phone do lead)
- Unir as duas listas (dedup) para ter a visão completa de todos os produtos comprados
- Isso garante que compras históricas (Eduzz 2023) sejam contabilizadas na soma

**3. Adicionar log de debug no card para validação**
- Exibir no `title` do badge de recontato: data base usada, produtos matched, soma total
- Facilita validação visual sem precisar abrir console

### Arquivos editados

| Arquivo | Mudança |
|---|---|
| `src/hooks/useRecontactDeadlines.ts` | Inverter prioridade: purchaseMap.firstPurchaseDate > metadata.purchased_at |
| `src/hooks/useBulkLeadPurchaseProducts.ts` | Adicionar query em customer_purchases para completar lista de produtos |

### Resultado esperado

Maria Helena (3 compras, ~1020d desde primeira compra):
- Produtos matched: todos os 3 com recontact_days configurados
- Data base: 26/06/2023 (primeira compra real)
- Soma: recontact_days de todos os produtos matched
- Countdown: calculado corretamente a partir da primeira compra + soma total

