

## Melhorias na Automação — 5 Funcionalidades

### a) Destacar variáveis no texto da mensagem

Atualmente o textarea é plain text. Para destacar variáveis como `{{nome}}`, vamos adicionar uma **preview renderizada** abaixo do textarea que mostra o texto com as variáveis destacadas visualmente (badges coloridos). O textarea continua editável normalmente, mas abaixo dele aparece um preview estilizado.

**Arquivo:** `WzNodeConfigPanel.tsx`
- Abaixo de cada textarea, renderizar um div de preview que faz regex replace de `{{...}}` por spans com `bg-primary/20 text-primary font-semibold rounded px-1`
- Mostrar/esconder com um toggle "Visualizar" pequeno

### b) Ctrl+C / Ctrl+V para duplicar nós

Adicionar keyboard shortcuts no canvas para copiar e colar nós sem precisar abrir o painel.

**Arquivo:** `WzFlowCanvasEditor.tsx`
- Estado `clipboard: Node | null`
- `useEffect` com listener de `keydown`:
  - `Ctrl+C`: copia o nó selecionado para o clipboard
  - `Ctrl+V`: cola o nó do clipboard com offset de posição (+60, +60)
- Usar a função `handleNodeDuplicate` como base

### c) Seleção múltipla (Ctrl+Click e arrastar)

O ReactFlow já suporta seleção múltipla nativamente, mas precisa ser habilitado.

**Arquivo:** `WzFlowCanvasEditor.tsx`
- Adicionar props `selectionOnDrag`, `selectionMode` e `multiSelectionKeyCode="Control"` ao `<ReactFlow>`
- Importar `SelectionMode` do `@xyflow/react`
- O Ctrl+Click e o drag-to-select já funcionam com essas props

### d) Auto-layout (organizar fluxo automaticamente)

Adicionar botão "Organizar" no header que distribui os nós verticalmente usando algoritmo de layout em árvore (dagre ou manual).

**Arquivo:** `WzFlowCanvasEditor.tsx`
- Instalar `@dagrejs/dagre` (ou implementar layout simples baseado em topological sort)
- Função `autoLayout()` que:
  1. Cria um grafo DAG com os nós e edges
  2. Calcula posições com espaçamento vertical de ~150px e horizontal de ~250px
  3. Atualiza posições dos nós
- Botão com ícone `LayoutGrid` no header ao lado de Salvar

### e) Desabilitar nó (sem remover)

Permitir desativar um nó — ele fica visualmente esmaecido e o executor pula ele.

**Arquivos:**
- `WzNodeConfigPanel.tsx`: Adicionar toggle "Ativo/Desabilitado" no topo do painel de config
- `WzFlowCanvasEditor.tsx`: Persistir `data.disabled` no nó
- **Todos os nós visuais** (WhatsApp, Timer, Condition, etc.): Adicionar classe `opacity-40 grayscale` + badge "Desabilitado" quando `data.disabled === true`
- Nós afetados: `WzWhatsAppNode`, `WzTimerNode`, `WzConditionNode`, `WzSmartDelayNode`, `WzWebhookNode`, `WzTagNode`, `WzGotoNode`, `WzAbSplitNode`, `WzStopNode`

### Resumo de arquivos

| Arquivo | Mudanças |
|---|---|
| `WzFlowCanvasEditor.tsx` | Ctrl+C/V, seleção múltipla, auto-layout, botão organizar |
| `WzNodeConfigPanel.tsx` | Preview de variáveis, toggle desabilitar nó |
| 9 componentes de nó | Estilo disabled (opacity + badge) |
| `package.json` | Adicionar `@dagrejs/dagre` |

