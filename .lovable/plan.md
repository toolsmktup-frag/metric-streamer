

## Corrigir conexões bugando ao duplicar/copiar/recarregar

### Problemas no código atual

1. **Edges perdem estilo ao carregar do banco** (linha 193): `setEdges(existingFlow.edges)` injeta edges brutas sem `type: 'smoothstep'`, `animated: true` nem `style`. O `defaultEdgeOptions` só se aplica a edges criadas via `onConnect`.

2. **Colisão de IDs ao colar edges** (linha 121): O ID `e_${source}_${target}` não inclui `sourceHandle`. Um nó Divisor com múltiplos handles (`path_0`, `path_1`) gera IDs que colidem — uma edge sobrescreve a outra.

3. **Duplicação não clona data profundamente** (linha 313-318): `{ ...original }` faz spread raso — arrays como `paths`, `sellers`, `messages` ficam compartilhados por referência entre o nó original e o duplicado.

4. **Paste também não clona data profundamente** (linha 116): `{ ...node.data }` é spread raso, mesmo problema.

### Correções (todas em `WzFlowCanvasEditor.tsx`)

**1. Carregar edges com estilo** — linha 193
```typescript
if (existingFlow.edges?.length) {
  setEdges(existingFlow.edges.map((e: any) => ({
    ...defaultEdgeOptions,
    ...e,
  })) as Edge[]);
}
```

**2. Incluir sourceHandle no ID das edges coladas** — linha 121
```typescript
id: `e_${idMap.get(ed.source)}_${idMap.get(ed.target)}_${ed.sourceHandle || 'default'}`,
```

**3. Deep-clone data na duplicação** — linha 313-318
```typescript
const newNode: Node = {
  ...original,
  id: getNodeId(),
  position: { x: original.position.x + 40, y: original.position.y + 40 },
  selected: false,
  data: JSON.parse(JSON.stringify(original.data)),
};
```

**4. Deep-clone data no paste** — linha 116
```typescript
data: JSON.parse(JSON.stringify(node.data)),
```

**5. Aplicar estilo nas edges coladas** — linhas 119-124
```typescript
const newEdges: Edge[] = clipboard.edges.map((ed) => ({
  ...defaultEdgeOptions,
  ...ed,
  id: `e_${idMap.get(ed.source)}_${idMap.get(ed.target)}_${ed.sourceHandle || 'default'}`,
  source: idMap.get(ed.source)!,
  target: idMap.get(ed.target)!,
}));
```

### Arquivo editado

- `src/components/wz-automation/WzFlowCanvasEditor.tsx`

