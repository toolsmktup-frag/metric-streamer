

## Mostrar LTV nos cards e ordenar por maior valor por padrão

### Problemas identificados

1. **Sort padrão é 'recent'** — o user quer que abra já ordenado por maior LTV
2. **Query key do bulk hook pode estar com cache stale** — o `stableKey` usa apenas contagem de emails/phones, o que pode causar colisão de cache. E o `leadKeyMap` é referenciado no `queryFn` mas não está como dependência real do `queryKey`
3. **Os dados de LTV provavelmente estão carregando** mas demora com 26k leads (milhares de lookups no `unified_customers`). Os cards aparecem sem badges enquanto a query está em andamento — não há indicação visual de loading

### Alterações

**`src/components/lead-funnels/KanbanBoard.tsx`**
- Mudar sort padrão de `'recent'` para `'ltv'`

**`src/hooks/useBulkLeadPurchases.ts`**
- Melhorar `stableKey` para incluir hash dos emails/phones (evitar colisão de cache)
- Adicionar log de debug para confirmar se a query está rodando e quantos resultados retorna

**`src/components/lead-funnels/LeadCard.tsx`**
- Mostrar badges de LTV e quantidade de compras **sempre que disponível**, mesmo quando tem metadata (remover a condição `!hasLTV` dos badges de produto/status — mostrar ambos)
- Tornar o badge de LTV mais proeminente (ao lado do nome, não embaixo)

