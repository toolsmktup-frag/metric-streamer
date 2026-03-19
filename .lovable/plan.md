

## Plano: Corrigir restrição do Resumo Geral para vendedor

### Problema
Duas causas:
1. **Sidebar esconde o link, mas não bloqueia a rota** — o vendedor pode acessar `/resumo` diretamente pela URL
2. **A rota padrão `/` redireciona para `/resumo`** — mesmo sem o link no sidebar, o vendedor cai no Resumo Geral ao fazer login

### Solução

**1. Criar componente de rota protegida por permissão**
- Arquivo: `src/components/PermissionRoute.tsx`
- Componente wrapper que verifica `useMyPermissions()` antes de renderizar a página
- Se o módulo não estiver habilitado, redireciona para a primeira rota disponível

**2. Proteger a rota `/resumo` com permissão**
- Arquivo: `src/App.tsx`
- Envolver a rota `/resumo` com `PermissionRoute` verificando `mod_resumo`

**3. Ajustar rota padrão `/`**
- Arquivo: `src/pages/Index.tsx`
- Em vez de redirecionar cegamente para `/resumo`, verificar permissões e redirecionar para a primeira rota acessível (ex: se não tem `mod_resumo`, vai para o primeiro funil ou `/leads`)

### Arquivos editados
- `src/components/PermissionRoute.tsx` (novo)
- `src/App.tsx` — usar PermissionRoute nas rotas
- `src/pages/Index.tsx` — redirecionar inteligente baseado em permissões

