

## Diagnóstico

A migration de RLS foi executada com sucesso — `get_user_org_id()` roda sem recursão (HTTP 200). O problema agora é de **dados**: a função retorna `null` porque o registro do usuário em `user_profiles` não tem `organization_id` preenchido.

Evidência: `POST /rpc/get_user_org_id` → Response Body: `null`

## Correção necessária

### 1. Ação manual no SQL Editor (dados)
Vincular o usuário à organização existente com UPDATE/INSERT conforme o SQL acima.

### 2. Melhoria no frontend (código)
Atualizar `useLeadCampaigns.ts` para dar uma mensagem mais clara quando `get_user_org_id` retorna null, diferenciando "função não existe" de "usuário sem organização". Também adicionar um fallback que tenta buscar a organização do usuário de outra forma ou mostra instruções claras.

### Mudanças no código

**`src/hooks/useLeadCampaigns.ts`** — melhorar a mensagem de erro do `fetchOrgId`:
- Se `data` for null, mostrar "Seu perfil não está vinculado a uma organização. Peça ao administrador para vincular."
- Mesma correção em `src/hooks/useLeadFunnels.ts`

### Resultado
Após o UPDATE no banco + ajuste no frontend, criar campanha vai funcionar normalmente.

