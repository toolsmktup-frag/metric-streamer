

## Permitir nome customizado no ID manual do seletor de produtos

### O que muda

No campo "Digitar ID manual..." do `WzProductSelector`, permitir que o usuário informe também um nome amigável junto com o ID, para que o chip exiba algo legível em vez de só o número.

### Como funciona para o usuário

1. O campo de ID manual ganha um segundo input de nome (opcional)
2. Ao digitar ex: ID `105335` e nome `Pote Grátis`, o chip exibe: **105335 — Pote Grátis**
3. Se não preencher o nome, continua exibindo só o ID como hoje

### Detalhes técnicos

O componente hoje trabalha com `selectedIds: string[]`. Para guardar labels customizados sem quebrar a interface existente:

- Adicionar uma prop opcional `customLabels?: Record<string, string>` e `onCustomLabelsChange?: (labels: Record<string, string>) => void`
- No `WzNodeConfigPanel`, persistir os labels no `data` do nó (ex: `data.productIdLabels`)
- Estado local `manualName` junto com `manualId`
- No `getProductLabel`, fazer fallback: produto do catálogo → label customizado → só o ID
- Layout do campo manual: dois inputs lado a lado (ID + Nome) + botão +

### Arquivos alterados

| Arquivo | Mudança |
|---|---|
| `WzProductSelector.tsx` | Novo input de nome, props `customLabels`/`onCustomLabelsChange`, lógica de label |
| `WzNodeConfigPanel.tsx` | Passar `customLabels={data.productIdLabels}` e handler de update |

