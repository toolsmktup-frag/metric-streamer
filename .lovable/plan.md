

## Aplicar Tema Clean Slate (modo seguro)

### Estratégia
Converter manualmente os valores `oklch` do tema Clean Slate para **HSL** e aplicar no `src/index.css`, mantendo o formato existente que todo o projeto espera.

**NÃO rodar** `npx shadcn@latest add` — risco de migração para Tailwind v4.

### Conversão oklch → HSL (valores calculados)

**Light mode:**
| Token | oklch | HSL equivalente |
|-------|-------|-----------------|
| --background | oklch(0.9842...) | 230 25% 97% |
| --foreground | oklch(0.2795...) | 248 28% 16% |
| --primary | oklch(0.5854...) | 262 83% 58% |
| --card | oklch(1.0) | 0 0% 100% |
| --secondary | oklch(0.9276...) | 250 10% 90% |
| --muted | oklch(0.9670...) | 250 5% 95% |
| --accent | oklch(0.9299...) | 268 30% 88% |
| --destructive | oklch(0.6368...) | 15 80% 50% |
| --border | oklch(0.8717...) | 252 10% 83% |

**Dark mode:** mesma lógica, valores escuros convertidos.

### O que muda
1. **`src/index.css`** — substituir valores HSL de `:root` e `.dark` pelos equivalentes do Clean Slate
2. **`tailwind.config.ts`** — adicionar cores `chart-1` a `chart-5` no extend
3. Preservar **todos** os tokens customizados: `--kpi-*`, `--roas-*`, `--table-*`, `--skeleton-*`, `--sidebar-bg/fg/hover/active`

### O que NÃO muda
- Formato das variáveis (`H S% L%` sem parênteses)
- `darkMode: "class"` no tailwind config
- `useTheme.ts`
- Nenhum componente ou página
- Nenhuma das 143 referências `hsl(var(--...))` nos arquivos

### Segurança
- Backups já existem: `index.backup.css`, `tailwind.config.backup.ts`, `useTheme.backup.ts`
- Se algo der errado, restaura em 10 segundos

### Resultado visual
O tema muda de **verde** (hsl 152) para **roxo/índigo** (hsl ~262), tanto em light quanto dark mode. Todos os KPIs, gráficos e tabelas continuam funcionando normalmente.

