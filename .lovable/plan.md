

## Plano: Persistir visualização do Kanban (fixar Recontato como padrão)

### O que muda
Salvar o modo de ordenação selecionado no `localStorage` por funil. Quando o usuário escolher "Recontato" (ou qualquer outro), na próxima vez que abrir o funil, já vem com essa ordenação.

### Arquivo: `src/components/lead-funnels/KanbanBoard.tsx`

**Linha 74** — Trocar o `useState` simples por um que lê/salva no `localStorage`:

```typescript
const storageKey = `kanban-sort-${funnelId}`;
const [sortMode, setSortMode] = useState<SortMode>(() => {
  const saved = localStorage.getItem(storageKey);
  return (saved && SORT_CYCLE.includes(saved as SortMode)) ? saved as SortMode : 'recontact';
});
```

- Default muda de `'ltv'` para `'recontact'`
- Se o usuário já tiver salvo outra preferência, ela é respeitada

**Adicionar `useEffect`** para persistir mudanças:
```typescript
useEffect(() => {
  localStorage.setItem(storageKey, sortMode);
}, [storageKey, sortMode]);
```

### Resultado
- Recontato vira o padrão ao abrir qualquer funil pela primeira vez
- A escolha fica "fixada" por funil — se trocar para "Maior LTV" no funil X, ele lembra

