

## Problema

Os badges de valor "Pendente" e "Recuperar" não aparecem no Kanban porque:

1. **Sem regras de transição = sem classificação.** O `stageClassificationMap` é construído a partir de `transitionRules`. Se o funil não tem regras, nenhuma etapa recebe classificação e o badge não renderiza (check na linha 153: `stageClassification` precisa ser truthy).

2. **Leads com LTV nunca mostram badge pendente.** A condição `!hasLTV` impede que leads com compras aprovadas mostrem valores pendentes — mas um lead pode ter compras antigas E um Pix pendente novo.

## Correções

### 1. Fallback de classificação por nome da etapa
Quando não há `transitionRules`, inferir a classificação pelo nome da etapa (ex: "Pix / Boleto Gerado" → `pending`, "Carrinho Abandonado" → `negative`, "Compra Aprovada" → `positive`). Isso faz os badges funcionarem mesmo sem regras configuradas.

**Arquivo:** `src/components/lead-funnels/KanbanBoard.tsx`
- No `stageClassificationMap`, após processar as rules, se uma etapa não tem classificação, tentar inferir pelo nome usando keywords (`pix`, `boleto`, `abandonad`, `recusad`, `reembolso`, `chargeback`, `cancelad` → negative/pending).

### 2. Mostrar badge pendente/recuperar MESMO quando tem LTV
Remover a condição `!hasLTV` do badge de valor. Se o lead tem LTV (verde) E também tem um valor pendente no metadata, mostrar ambos: o LTV e o badge pendente/recuperar abaixo.

**Arquivo:** `src/components/lead-funnels/LeadCard.tsx`
- Linha 153: remover `!hasLTV &&` da condição
- O badge de metadata aparece independente do LTV

### 3. Header da coluna — mostrar valor mesmo sem regras
O `getStageRevenue` já funciona (soma `metadata.amount`). O header da coluna já mostra o total. A classificação de cor do header também precisa do mesmo fallback por nome de etapa.

### Arquivos alterados
- `src/components/lead-funnels/KanbanBoard.tsx` — fallback de classificação por nome de etapa
- `src/components/lead-funnels/LeadCard.tsx` — remover condição `!hasLTV` do badge

