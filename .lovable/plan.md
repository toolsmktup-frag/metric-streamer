

## Plano: Blindagem definitiva contra erros removeChild e tela branca

### O que ainda falta (por que funciona em anônimo mas não em normal)

Em aba normal, extensões do navegador (Google Translate, Grammarly, Tawk.to, etc.) **mutam nós do DOM** que o React/Radix gerencia. A proteção `translate="no"` que já aplicamos bloqueia **tradutores**, mas:

1. **O ErrorBoundary captura o erro de removeChild e derruba a tela inteira** — ele deveria **ignorar** esse tipo de erro e continuar renderizando normalmente
2. **Erros fora do React** (window.onerror, unhandledrejection) não são capturados — podem causar tela branca em cenários específicos
3. **DropdownMenuSubContent** não tem proteção anti-tradução (gap)
4. **Toaster/Sonner** renderiza em portal e não tem proteção

### Ajustes

**1. ErrorBoundary inteligente** (`src/components/ErrorBoundary.tsx`)
- Detectar se o erro é do tipo `removeChild`/`insertBefore`/`appendChild` (DOM mutation externa)
- Se for, **não mostrar a tela de erro** — apenas logar no console e continuar renderizando
- Usar `this.setState({ hasError: false })` para "engolir" o erro e manter a UI funcionando

**2. Proteção global no `main.tsx`**
- Adicionar `window.addEventListener('error', ...)` que intercepta erros de DOM mutation e impede propagação
- Adicionar handler para `unhandledrejection` para evitar crashes silenciosos

**3. Completar gaps nos componentes UI**
- `DropdownMenuSubContent` — adicionar `translate="no"` e `notranslate`
- Verificar se `Toaster`/`Sonner` precisa proteção

**4. Proteção CSP-style no `<head>`**
- Adicionar `<style>` que força `font[class] { display: none !important }` para bloquear injeção de tradutores que criam `<font>` tags dentro de portals

### Arquivos a editar
- `src/components/ErrorBoundary.tsx` — filtrar erros de mutação DOM
- `src/main.tsx` — handler global de erros
- `src/components/ui/dropdown-menu.tsx` — proteger SubContent
- `index.html` — CSS defensivo opcional

### Resultado
- Extensões podem mutar o DOM sem derrubar a tela
- O ErrorBoundary só mostra "Algo deu errado" para erros reais de lógica
- Funciona igual em aba normal e anônima

