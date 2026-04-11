

## Melhorar Filtro de Produto no Gatilho de Automação

### Problema Atual
- O campo "Filtrar por ID do produto" aceita **um único ID** digitado manualmente
- Mesmo produto pode ter IDs diferentes na Ticto e Guru → precisa criar gatilhos separados
- Não há busca nos produtos já cadastrados no sistema
- Não suporta múltiplos IDs/ofertas num único gatilho

### Solução Proposta

**1. Trocar o campo de ID por um seletor com busca nos produtos cadastrados**

O sistema já tem produtos cadastrados em 2 tabelas:
- `funnel_products` (catálogo de tráfego) — tem `product_id` (ID externo), `product_name_contains`, `display_name`
- `lead_funnel_products` (funis de leads) — tem `product_name_contains`, `display_name`

No painel do gatilho, substituir o Input de texto por um **combobox com busca** que lista todos os produtos de `funnel_products` agrupados por funil. O usuário digita e filtra, ou seleciona da lista.

**2. Suportar múltiplos IDs de produto por gatilho**

Transformar `productIdFilter` de `string` para `string[]` (array de IDs). Na UI, cada produto selecionado vira um chip/tag removível. O usuário pode adicionar vários — ex: ID Ticto `46342` + ID Guru `1765548391`.

**3. Suportar múltiplas ofertas por gatilho**

Mesmo padrão: `offerFilter` vira `string[]`, com chips para cada oferta.

**4. Atualizar o wz-receiver para aceitar arrays**

O `matchesTrigger` passa a verificar se `event.product_id` está contido no array `productIdFilter[]` (com fallback para string única para compatibilidade com gatilhos existentes).

### Implementação

| Arquivo | Mudança |
|---------|---------|
| `WzNodeConfigPanel.tsx` | Novo componente `ProductSelector` com combobox + chips multi-select, busca em `funnel_products` |
| `WzNodeConfigPanel.tsx` | Campo de oferta vira multi-input com chips |
| `WzTriggerNode.tsx` | Mostrar badges dos produtos selecionados no nó visual |
| `wz-receiver/index.ts` | `matchesTrigger` aceita array: `productIdFilter.includes(event.product_id)` |

### UX do Seletor de Produto

```text
┌─ Filtrar por produto(s) ──────────────────┐
│ 🔍 Buscar produto...                      │
│                                            │
│ [46342 - Guia Tinturas (Ticto)]  ✕        │
│ [1765548391 - Guia Tinturas (Guru)]  ✕    │
│                                            │
│ ▾ Dropdown:                                │
│   Guia de Tinturas                         │
│     • 46342 — Front-end (Ticto)            │
│     • 47629 — Bump (Ticto)                 │
│   Outro Funil                              │
│     • 1765548391 — Front-end (Guru)        │
│   ───────────────                          │
│   + Digitar ID manualmente                 │
└────────────────────────────────────────────┘
```

O usuário pode tanto selecionar da lista quanto digitar um ID manual. Os produtos aparecem agrupados pelo funil de origem, com ID + nome + papel.

### Compatibilidade

- Gatilhos existentes com `productIdFilter` como string continuam funcionando — o wz-receiver trata tanto string quanto array
- Gatilhos existentes com `offerFilter` como string idem

