## Problema

No card da Ana Maria (funil RECOMPRA - POTES / Articulabem) aparece `1097d` e `-1074d 🔥`, mas:
- Ela tem 3 compras: Pote Grátis ArticulaBEM (19/02/26), SUPER COMBO Erveiro (08/11/24), Guia de Tinturas (06/06/23).
- Só **Pote Grátis ArticulaBEM** casa com a config do funil (Articulabem Pote Grátis → 23d).
- O deadline deveria ser **19/02/26 + 23d**, não baseado na compra mais antiga.

## Causa

Em `useBulkLeadPurchaseProducts.ts`, `lastPurchaseDate` é a data do evento mais recente **entre TODAS as compras do lead**, e em `useRecontactDeadlines.ts` essa data é usada como base para somar os `recontact_days` dos produtos que casam. Como `lead_events.created_at` pode divergir da ordem de compra real (eventos sincronizados em momentos diferentes), a "data mais recente" acaba sendo de um produto que nem participa do recontato — no caso da Ana, provavelmente o evento do Guia de Tinturas (06/2023) foi gravado por último na linha do tempo, puxando o cálculo para ~1097 dias atrás.

A regra correta: **considerar apenas as datas dos produtos que casam com a config do funil**, e usar a **mais recente entre elas** como base — e somar apenas os `recontact_days` desses produtos casados.

## Solução

### 1) `src/hooks/useBulkLeadPurchaseProducts.ts`
Expandir `LeadPurchaseInfo` para guardar a lista de compras com data por produto:
```ts
export interface LeadPurchaseInfo {
  productNames: string[];           // mantém para compat
  lastPurchaseDate: string;         // mantém para compat
  purchases: Array<{ productName: string; date: string }>;
}
```
- No loop de eventos, montar `purchases` com `{ productName, date: created_at }`.
- Quando vier de `metadata.product_name` do lead (fallback), incluir com `date: ''`.

### 2) `src/hooks/useRecontactDeadlines.ts`
Trocar a lógica de cálculo:
- Para cada lead, iterar `purchaseInfo.purchases` (em vez de `productNames` + uma única data).
- Para cada compra, rodar `matchProduct(purchase.productName)`. Se casar:
  - Calcular o `deadline` desse item = `parseLocalDateTime(purchase.date || fallbacks) + recontact_days`.
  - Guardar `{ deadline, product, days }`.
- Se houver itens casados:
  - Escolher o **deadline mais recente (max)** — esse vira o `deadlineDate` exibido.
  - `productName` exibido = display name do produto vencedor.
  - `recontactDays` = `recontact_days` do vencedor.
  - `daysRemaining = differenceInDays(deadlineDate, today)`.
- Fallback: se nenhuma compra tiver data válida, usar `metadata.purchased_at` ou `purchaseMap.firstPurchaseDate` como hoje.

Isso elimina a "soma linear" entre produtos diferentes (que inflacionava deadlines como `Pote Grátis + 9 Potes = 273d`) e passa a usar a regra: **cada produto comprado gera seu próprio deadline a partir da SUA data; o card mostra o mais distante (mais recente vence)**.

> Se você quiser manter a soma linear quando o lead tem múltiplas compras do **mesmo produto da config**, eu adapto — mas pela imagem o que faz sentido é "deadline por produto, escolher o mais futuro".

### 3) Sem mudança de schema / sem migration / sem edge function

## Validação

- Ana Maria (lead no funil 2fcd2f48…): deve passar a mostrar `~ -82d 🔥` (19/02/26 + 23d ≈ 14/03/26 vs hoje 07/06/26), em vez de `-1074d`.
- Cards que só têm 1 compra matched continuam idênticos.
- Cards sem produto matched continuam sem badge.
