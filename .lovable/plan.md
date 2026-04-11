

# Fix: Drag-and-drop para reordenar etapas do funil

## Problema
O ícone de arrastar (GripVertical) aparece ao lado de cada etapa, mas não há nenhuma lógica de drag-and-drop implementada. As etapas não podem ser reordenadas.

## Solução
Implementar reordenação via drag-and-drop usando `@dnd-kit/core` + `@dnd-kit/sortable`, que é a biblioteca padrão para React.

## Passos

### 1. Instalar dependência
- `@dnd-kit/core` e `@dnd-kit/sortable` e `@dnd-kit/utilities`

### 2. Criar componente `SortableStageItem`
- Extrair cada linha de etapa para um componente separado que usa `useSortable` do dnd-kit
- O GripVertical vira o handle de arraste

### 3. Atualizar `FunnelConfigTab.tsx`
- Envolver a lista de etapas com `DndContext` + `SortableContext`
- No `onDragEnd`, reordenar o array `localStages` movendo o item da posição antiga para a nova
- Usar `verticalListSortingStrategy`

## Detalhes técnicos
- A reordenação é local (state) até o usuário clicar "Salvar Etapas", que já envia `sort_order` baseado no índice
- Sem mudanças no backend — o `handleSaveStages` já faz `localStages.map((s, i) => ({ ...s, sort_order: i }))`

