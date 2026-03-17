
# Drag-and-Drop no Kanban

## O que será feito

Adicionar a capacidade de arrastar cards de leads entre colunas do Kanban para mudar a etapa do lead no funil. Ao soltar o card em outra coluna, o sistema atualiza o `lead_stage_positions` no Supabase e registra um evento de movimentação.

## Abordagem

Usar **@dnd-kit** (leve, moderno, sem problemas com React 18+ strict mode) com `DndContext`, `SortableContext` e `useDroppable` para as colunas.

## Arquivos

| Arquivo | Ação |
|---------|------|
| `package.json` | Adicionar `@dnd-kit/core` e `@dnd-kit/sortable` |
| `src/components/lead-funnels/KanbanBoard.tsx` | Envolver em `DndContext`, colunas como droppable, cards como draggable. Callback `onDragEnd` que chama `onMoveLeadToStage` |
| `src/components/lead-funnels/LeadCard.tsx` | Wrap com `useDraggable` — adicionar drag handle e visual de arraste |
| `src/hooks/useMoveLeadStage.ts` | Criar — mutation que atualiza `lead_stage_positions.stage_id` e insere `lead_events` com evento "stage_change" |
| `src/pages/LeadFunnelDetail.tsx` | Passar callback de movimentação para o KanbanBoard |

## Fluxo

1. Usuário clica e arrasta um LeadCard
2. Card ganha visual de "arrastando" (opacidade, sombra elevada)
3. Coluna de destino ganha highlight (borda colorida)
4. Ao soltar: mutation atualiza `stage_id` no `lead_stage_positions` + insere evento "stage_change" no `lead_events`
5. Invalidação de queries atualiza o Kanban automaticamente
6. Toast confirmando a movimentação
