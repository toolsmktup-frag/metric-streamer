

# Fix: Drag-and-drop das etapas não persiste a ordem

## Problemas identificados

1. **useEffect sobrescreve o estado local** (linha 94-98): Sempre que o array `stages` muda de referência (mesmo sem mudança real), o `useEffect` reseta `localStages`, desfazendo qualquer reordenação feita via drag.

2. **Stages não são ordenados por `sort_order`** ao carregar do banco — o Supabase pode retornar em qualquer ordem se não houver `.order('sort_order')` explícito.

## Correções

### 1. Ordenar stages por `sort_order` no useEffect
No `FunnelConfigTab.tsx`, o `useEffect` que sincroniza `stages` → `localStages` deve ordenar por `sort_order` antes de setar:
```ts
useEffect(() => {
  if (stages.length > 0) {
    const sorted = [...stages].sort((a, b) => a.sort_order - b.sort_order);
    setLocalStages(sorted);
  }
}, [stages]);
```

### 2. Garantir que a query de stages retorna ordenada
No `useLeadFunnels.ts`, a query já faz `.select('*, lead_funnel_stages(*)')` mas não ordena os stages. Vamos adicionar ordenação no `useUpsertStages` (já retorna com `.order('sort_order')`), e ordenar no frontend como fallback.

### 3. Evitar reset desnecessário após drag
Usar comparação de IDs para não resetar se a composição não mudou — apenas a ordem. Serializar os IDs+ordem como chave de comparação.

## Arquivos modificados
- `src/components/lead-funnels/FunnelConfigTab.tsx` — ordenar no useEffect + evitar reset pós-drag

