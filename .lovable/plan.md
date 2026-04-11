

## Plano: Corrigir layout responsivo dos dashboards

### Problema
Em viewports intermediários (~983px), os KPI cards com valores monetários longos (ex: "R$ 29.081,68") ficam truncados ou estouram o layout. Isso acontece porque:

1. **FunilResumo.tsx** usa `lg:grid-cols-4` — a partir de 1024px tenta encaixar 4 cards, muito apertado para valores grandes
2. **Resumo.tsx** usa `lg:grid-cols-3 xl:grid-cols-4` — melhor, mas ainda trunca em ~1024px com 3 colunas + sidebar
3. **KPICard.tsx** usa `truncate` no valor, cortando o número em vez de ajustar o tamanho da fonte
4. **Charts Row 2** (`md:grid-cols-3`) força 3 colunas a partir de 768px — muito cedo quando há sidebar

### Correções

**1. KPICard.tsx — valor nunca deve truncar**
- Trocar `truncate` por `break-all` ou melhor: reduzir o `text-2xl` no breakpoint problemático
- Usar `text-base sm:text-lg lg:text-xl xl:text-2xl` para escala progressiva
- Remover `truncate` do valor (números cortados perdem sentido)

**2. FunilResumo.tsx — grid KPI mais conservador**
- Mudar `grid-cols-1 sm:grid-cols-2 lg:grid-cols-4` para `grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4`
- Charts Row 2: `md:grid-cols-3` → `grid-cols-1 lg:grid-cols-3`

**3. Resumo.tsx — mesmos ajustes**
- Charts Row 2: `md:grid-cols-3` → `grid-cols-1 lg:grid-cols-3`

**4. Criativos.tsx e CrmAnalytics.tsx — mesma padronização**
- Onde usar `lg:grid-cols-4`, mudar para `lg:grid-cols-3 xl:grid-cols-4`

**5. LeadsDashboard.tsx**
- `md:grid-cols-4` → `sm:grid-cols-2 lg:grid-cols-4`

### Arquivos alterados
- `src/components/dashboard/KPICard.tsx`
- `src/pages/FunilResumo.tsx`
- `src/pages/Resumo.tsx`
- `src/pages/Criativos.tsx`
- `src/pages/CrmAnalytics.tsx`
- `src/pages/LeadsDashboard.tsx`

