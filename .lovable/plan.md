

## Plano: Corrigir Resumo Geral e redirecionar para Dashboard de Leads

### Problema
1. O "Resumo Geral" pode ainda aparecer por cache de permissões (staleTime de 2 min) ou possível falha na verificação
2. O fallback atual redireciona para `/leads` ao invés de `/leads/dashboard`

### Mudanças

**1. Alterar fallback de redirecionamento para `/leads/dashboard`**
- `src/components/PermissionRoute.tsx` — mudar fallbackPath default de `/leads` para `/leads/dashboard`
- `src/pages/Index.tsx` — mudar todos os fallbacks de `/leads` para `/leads/dashboard`

**2. Reduzir cache de permissões para evitar dados stale**
- `src/hooks/useUserPermissions.ts` — reduzir `staleTime` de 2 minutos para 30 segundos na query `my-permissions`

**3. Garantir invalidação ao trocar de usuário**
- Adicionar `refetchOnMount: true` na query de permissões para sempre revalidar ao montar

### Arquivos editados
- `src/components/PermissionRoute.tsx`
- `src/pages/Index.tsx`
- `src/hooks/useUserPermissions.ts`

