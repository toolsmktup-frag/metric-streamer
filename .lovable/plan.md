

# Melhorias Completas do Flow Editor

## 5 Features a implementar

### 1. Labels editáveis nas conexões (edges)
- Adicionar campo `label` no `data` das edges
- No `ConversionEdge.tsx`, exibir label clicável acima da métrica
- Ao clicar na edge, abrir um pequeno input inline (via `EdgeLabelRenderer`) para editar o texto
- No `FunnelFlowEditor.tsx`, adicionar handler `onEdgeClick` que permite edição do label
- Salvar via `debouncedSaveEdges`

### 2. Campo de notas/anotações no painel de configuração
- No `NodeConfigPanel.tsx`, adicionar um `Textarea` para campo "Notas" em todos os tipos de node
- Armazenar como `data.notes` no node
- Exibir um ícone pequeno (StickyNote) no canto do node quando há notas — ajustar `PageNode`, `SourceNode`, `ActionNode` para mostrar indicador

### 3. Botão de duplicar node
- No `NodeConfigPanel.tsx`, adicionar botão "Duplicar" ao lado do botão "Remover"
- No `FunnelFlowEditor.tsx`, criar `handleDuplicateNode` que clona o node selecionado com novo ID e posição offset (+50, +50)
- Passar `onDuplicate` como prop ao `NodeConfigPanel`

### 4. Auto-layout (organização automática em árvore horizontal)
- Adicionar botão "Auto Layout" na toolbar superior do canvas (acima do ReactFlow, ao lado do indicador de saving)
- Implementar algoritmo simples de layout em camadas: fontes à esquerda, páginas no meio ordenadas por conexões, ações à direita
- Usar BFS a partir dos nodes sem inputs (sources) para calcular camadas, espaçamento vertical uniforme
- Atualizar posições dos nodes e chamar `debouncedSaveNodes`

### 5. Taxa de conversão automática nas edges
- No `useEffect` que sincroniza `leadCounts`, também calcular conversão nas edges: `count_target / count_source * 100`
- Atualizar `data.count` e `data.conversionRate` nas edges
- O `ConversionEdge` já renderiza isso — só precisa alimentar os dados

## Arquivos modificados

| Arquivo | Mudanças |
|---------|----------|
| `ConversionEdge.tsx` | Adicionar label editável inline, estado de edição |
| `NodeConfigPanel.tsx` | Campo de notas (Textarea), botão duplicar |
| `PageNode.tsx` | Indicador de notas (ícone) |
| `SourceNode.tsx` | Indicador de notas (ícone) |
| `ActionNode.tsx` | Indicador de notas (ícone) |
| `FunnelFlowEditor.tsx` | onEdgeClick, handleDuplicateNode, auto-layout, cálculo de conversão nas edges, botão auto-layout no UI |

Nenhuma migration ou arquivo novo necessário. Tudo client-side.

