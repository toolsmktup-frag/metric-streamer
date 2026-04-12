

## Fix: Nome customizado no ID manual não salva

### Problema

Quando você adiciona um produto com ID + nome, o componente dispara **duas atualizações separadas** em sequência rápida:
1. `update('productIdFilter', [novos ids])`  
2. `update('productIdLabels', {novas labels})`

A segunda chamada usa o estado **antigo** do nó (antes da primeira atualização ser aplicada), então sobrescreve o `productIdFilter` que acabou de ser alterado — ou vice-versa. Resultado: uma das duas mudanças se perde.

### Solução

Fazer o `addManual` disparar **uma única atualização** que inclua tanto o `productIdFilter` quanto o `productIdLabels` de uma vez.

### Arquivos alterados

| Arquivo | Mudança |
|---|---|
| `WzProductSelector.tsx` | Adicionar prop `onAddManual?: (id: string, name?: string) => void` como alternativa; OU trocar para disparar um único callback com ambos os valores |
| `WzNodeConfigPanel.tsx` | Passar um handler unificado que faz `onUpdate(nodeId, { ...data, productIdFilter: newIds, productIdLabels: newLabels })` de uma só vez |

### Abordagem concreta

1. **`WzProductSelector`**: Adicionar uma prop opcional `onManualAdd?: (id: string, name: string) => void`. Quando presente, o `addManual` chama só esse callback em vez de `onChange` + `onCustomLabelsChange` separados.

2. **`WzNodeConfigPanel`**: Passar o `onManualAdd` que faz um único `onUpdate` com os dois campos atualizados simultaneamente:
```typescript
onManualAdd={(id, name) => {
  const ids = [...(data.productIdFilter || []), id];
  const labels = { ...(data.productIdLabels || {}), ...(name ? { [id]: name } : {}) };
  onUpdate(node.id, { ...data, productIdFilter: ids, productIdLabels: labels });
}}
```

Isso garante que ambos os campos são salvos atomicamente no estado do nó, sem race condition.

