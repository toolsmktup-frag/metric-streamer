

## Plano: Corrigir cálculo de recontato e dados nos cards

### Causa raiz identificada

**Bug de parsing de data brasileiro** no `useRecontactDeadlines.ts` (linha 81):
```ts
const purchaseDate = new Date(purchasedAt); // BUG!
```

O metadata armazena `purchased_at` no formato brasileiro `"08/01/2026 15:30:18"` (dd/MM/yyyy). O `new Date()` do JavaScript interpreta isso como **1 de agosto de 2026** (MM/dd) em vez de **8 de janeiro de 2026**. Resultado: a data é parseada ~7 meses no futuro, gerando countdowns inflados (ex: 465d da Mércia).

O projeto já possui `parseLocalDateTime()` em `src/lib/localDate.ts` que trata corretamente o formato brasileiro. Ele simplesmente não está sendo usado no hook de recontato.

**Segundo problema**: leads sem `purchased_at` no metadata (campo vazio/null) são ignorados completamente (`if (!purchasedAt) continue`), então nunca ganham countdown - mesmo que tenham compra registrada em `customer_purchases`.

### Mudanças

**1. `src/hooks/useRecontactDeadlines.ts`** - Corrigir parsing de data
- Importar `parseLocalDateTime` de `@/lib/localDate`
- Substituir `new Date(purchasedAt)` por `parseLocalDateTime(purchasedAt)`
- Adicionar fallback: aceitar também `purchaseSummary.firstPurchaseDate` (já disponível via `useBulkLeadPurchases`) quando `purchased_at` do metadata estiver ausente
- Adicionar parâmetro opcional `purchaseMap: Map<string, PurchaseSummary>` ao hook

**2. `src/pages/LeadFunnelDetail.tsx`** - Passar purchaseMap ao hook
- O `KanbanBoard` já usa `useBulkLeadPurchases`; passar o map também para `useRecontactDeadlines`

**3. `src/components/lead-funnels/KanbanBoard.tsx`** - Expor purchaseMap
- Passar o `purchaseMap` como prop ou refatorar para que o recontact hook tenha acesso

### Impacto esperado
- Mércia: 465d corrigido para ~295d (Jan 8 + 365 = Jan 8, 2027 - hoje)
- Leads de "Pote Grátis" (30d): passarão a mostrar countdown negativo (vencido)
- "Atualizar Funil" passará a encontrar e mover leads vencidos

### Detalhes técnicos

Mudança principal no hook:
```ts
import { parseLocalDateTime } from '@/lib/localDate';

// Dentro do loop:
const purchaseDate = parseLocalDateTime(purchasedAt);
if (!purchaseDate) continue; // ao invés de new Date() + isNaN check
```

Fallback para leads sem purchased_at no metadata:
```ts
if (!purchasedAt && purchaseMap) {
  const summary = purchaseMap.get(pos.lead_id);
  if (summary?.firstPurchaseDate) {
    purchasedAt = summary.firstPurchaseDate; // ISO format from DB
  }
}
```

