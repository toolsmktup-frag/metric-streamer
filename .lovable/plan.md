

## Plano: Restringir abas do funil para vendedor + flag "Resumo Geral"

### Contexto
Atualmente o vendedor vê as abas Kanban, Funil, Flow Editor e Métricas. Apenas Configuração e Webhook estão ocultas. O usuário quer que o vendedor veja **somente Kanban e Funil**. Além disso, quer uma flag na configuração de permissões para controlar se o vendedor pode acessar o "Resumo Geral".

### Mudanças

**1. Ocultar abas Flow Editor e Métricas para vendedor**
- Arquivo: `src/pages/LeadFunnelDetail.tsx`
- Condicionar as `TabsTrigger` e `TabsContent` de "flow" e "metrics" com `isAdmin`, igual já é feito para "config" e "webhook"

**2. Adicionar permissão `mod_resumo` na tabela e no frontend**
- SQL: `ALTER TABLE user_permissions ADD COLUMN IF NOT EXISTS mod_resumo boolean DEFAULT true;`
- Arquivo: `src/hooks/useUserPermissions.ts` — adicionar `mod_resumo` ao `MODULE_KEYS`, `MODULE_LABELS` e interface `UserPermissions`
- Arquivo: `src/components/layout/AppSidebar.tsx` — condicionar o botão "Resumo Geral" com `can('mod_resumo')`, e redirecionar para a primeira rota disponível caso não tenha permissão

### SQL necessário
```sql
ALTER TABLE public.user_permissions
ADD COLUMN IF NOT EXISTS mod_resumo boolean DEFAULT true;
```

### Arquivos editados
- `src/pages/LeadFunnelDetail.tsx` — ocultar abas flow/metrics para vendedor
- `src/hooks/useUserPermissions.ts` — adicionar `mod_resumo`
- `src/components/layout/AppSidebar.tsx` — condicionar Resumo Geral

