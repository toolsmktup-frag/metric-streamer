

## Corrigir Overflow de Valores nos KPI Cards

### Problema
Na screenshot, valores monetários longos (ex: "R$ 118.928,3...", "R$ 71.135,90...") estão sendo cortados porque o texto `text-2xl` não tem proteção contra overflow dentro do card.

### Correções

**1. `src/components/dashboard/KPICard.tsx`**
- Adicionar `truncate` no parágrafo do valor para não quebrar o layout
- Reduzir fonte responsivamente: `text-lg sm:text-2xl` para valores caberem em telas menores
- Adicionar `min-w-0` no container flex para permitir truncamento correto
- Adicionar `title={value}` para o usuário ver o valor completo no hover

**2. `src/pages/Resumo.tsx`**
- O grid `lg:grid-cols-4` com 9 cards já está correto, mas em viewport ~1187px (entre `lg` e `xl`) os 4 cards ficam apertados
- Ajustar para `lg:grid-cols-3 xl:grid-cols-4` para dar mais espaço em telas intermediárias

### Resultado
- Valores nunca serão cortados visualmente
- Em telas menores a fonte reduz automaticamente
- Hover mostra valor completo quando truncado

