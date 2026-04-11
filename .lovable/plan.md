

## Auditoria de Responsividade — Diagnóstico e Melhorias

### Situação Atual

O projeto já usa algumas boas práticas em várias páginas (breakpoints `md:`, `lg:`, `xl:` nos grids de KPI e diagnósticos). Porém existem problemas significativos:

### Problemas Encontrados

**1. Sidebar não tem modo mobile**
- A sidebar customizada (`AppSidebar.tsx`) usa `width: 64px | 240px` fixo, sem esconder no mobile
- Não usa `useIsMobile()` (só o sidebar do shadcn usa)
- Em telas < 768px a sidebar ocupa espaço precioso e não tem hamburger menu

**2. Header não adapta para mobile**
- `AppLayout.tsx`: header com `px-6` fixo, DateRangePicker + SyncInfo + Refresh + UserMenu todos lado a lado
- Em telas pequenas os itens vão sobrepor ou quebrar

**3. Grids fixos sem breakpoint mobile**
- `grid grid-cols-3` sem `md:` em funnel stats (FunilKpi, KpiGeral — linha de CPC/CPL/ROAS)
- `grid grid-cols-4` no skeleton fallback do AppLayout (linha 87) — sem breakpoint
- Algumas tabelas sem `overflow-x-auto`

**4. Main padding fixo**
- `main` usa `p-6` fixo — no mobile deveria ser `p-3` ou `p-4`

### Plano de Correções

**Arquivo 1: `src/components/layout/AppLayout.tsx`**
- Adicionar `useIsMobile()` para controlar sidebar mobile
- Header: esconder `SyncInfo` no mobile, reduzir padding (`px-3 md:px-6`)
- Main: padding responsivo (`p-3 md:p-6`)
- Skeleton fallback: `grid-cols-2 md:grid-cols-4`

**Arquivo 2: `src/components/layout/AppSidebar.tsx`**
- No mobile: sidebar vira drawer overlay (posição `fixed`, fundo escuro)
- Botão hamburger no header para abrir/fechar
- Auto-fechar ao clicar em link no mobile

**Arquivo 3: Páginas com grids fixos**
- `FunilKpi.tsx` e `KpiGeral.tsx`: `grid-cols-3` → `grid-cols-1 sm:grid-cols-3`
- Tabelas de campanhas/anúncios: garantir `overflow-x-auto` nos wrappers

**Arquivo 4: Componentes menores**
- Botões com texto longo: adicionar `whitespace-nowrap` ou `truncate` onde faltar
- DateRangePicker: verificar se reduz label no mobile

### Impacto
- ~4 arquivos editados
- Zero mudança de lógica/dados
- Sidebar mobile com drawer é a maior mudança visual

