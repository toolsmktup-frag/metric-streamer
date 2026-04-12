

## O que já existe vs. o que falta

Cada nó já tem um campo "Notas" no painel de configuração (com o ícone amarelo de post-it). Mas o que você quer é um **bloco visual de anotação livre** no canvas — um post-it que fica solto no fluxo para documentar o que cada parte faz.

## Plano

### 1. Novo nó "Anotação" (sticky note)

- Criar `src/components/wz-automation/nodes/WzNoteNode.tsx` — um bloco estilo post-it amarelo/âmbar com texto editável diretamente no canvas (textarea inline)
- Sem handles (não conecta a nada) — é puramente visual
- Redimensionável arrastando o canto
- Cor customizável (amarelo, azul, verde, rosa)

### 2. Adicionar na sidebar

- Em `WzFlowSidebar.tsx`, nova seção "Utilidades" com o item "Anotação / Nota"

### 3. Registrar no canvas

- Em `WzFlowCanvasEditor.tsx`, registrar `note` nos `nodeTypes` e tratar o drop

### 4. Config panel

- Em `WzNodeConfigPanel.tsx`, adicionar config simples para o nó note: cor do post-it e texto

---

## Ideias adicionais para o canvas

| Funcionalidade | Descrição |
|---|---|
| **Grupos visuais** | Agrupar nós dentro de uma caixa com título (ex: "Sequência de boas-vindas") — ReactFlow suporta nós do tipo `group` |
| **Minimap** | Minimapa no canto para navegação rápida em fluxos grandes |
| **Undo/Redo** | Ctrl+Z / Ctrl+Y para desfazer mudanças no canvas |
| **Copiar/Colar nós** | Selecionar múltiplos nós e duplicar em bloco |
| **Validação visual** | Destacar nós com erro (ex: WhatsApp sem instância, Trigger sem tipo) com borda vermelha |
| **Contadores no header** | Mostrar no topo: total de nós, execuções recentes, taxa de sucesso |

Quer que eu implemente apenas o bloco de anotação, ou também alguma dessas extras?

