
Objetivo: sair do ciclo de erro com uma correção definitiva no Supabase, não com mais workarounds no frontend.

Minha sugestão
- Priorizar uma correção de backend/RLS agora.
- O frontend já tentou contornar o problema com fallback de `organization_id`, mas isso não resolve quando o banco rejeita o `INSERT`.

O que encontrei
1. Há uma policy com recursão infinita em `user_profiles`:
   - `Admin reads org profiles` consulta `public.user_profiles` dentro da própria policy.
   - Isso bate exatamente com o padrão de erro de “infinite recursion detected in policy”.
2. `organizations` está com RLS habilitado, mas no trecho de migration lido não apareceu policy de leitura para usuários autenticados.
   - Então a busca do `organization_id` no frontend pode falhar mesmo antes do insert.
3. Os objetos `lead_campaigns`, `lead_funnels` e relacionados não apareceram nas migrations do repositório.
   - Isso sugere banco fora de sincronia com o código, ou tabelas criadas fora das migrations versionadas.
4. A UI esconde o erro real:
   - `LeadCampaigns.tsx` mostra só `toast.error('Erro ao criar campanha')`, sem expor a mensagem do Supabase.

Plano recomendado
1. Auditar o banco real
   - Confirmar se `lead_campaigns` existe.
   - Confirmar constraints obrigatórias da tabela.
   - Confirmar policies atuais de `SELECT/INSERT/UPDATE/DELETE`.
2. Corrigir `user_profiles` de forma segura
   - Remover a policy recursiva.
   - Criar função `SECURITY DEFINER` para obter papel/organização do usuário.
   - Se houver controle por papel, usar tabela separada de roles, não `user_profiles`, para seguir o padrão seguro.
3. Corrigir acesso por organização
   - Criar função estável do tipo `get_my_org_id()` ou equivalente.
   - Usar essa função nas policies de `lead_campaigns` e `lead_funnels`:
     - `SELECT`: somente registros da organização do usuário.
     - `INSERT`: `organization_id = get_my_org_id()`.
     - `UPDATE/DELETE`: mesma restrição por organização.
4. Remover dependência frágil no frontend
   - Parar de depender de `select id from organizations limit 1`.
   - Inserir com o `organization_id` resolvido por política/função segura, ou via RPC específica.
   - Remover fallback hardcoded quando a camada de banco estiver corrigida.
5. Melhorar diagnóstico na UI
   - Exibir a mensagem real do Supabase no toast/log para diferenciar:
     - RLS
     - FK inválida
     - coluna obrigatória ausente
     - tabela inexistente

Resultado esperado
- Criar campanha e funil volta a funcionar para usuários autenticados.
- O fluxo de webhook e kanban deixa de depender de hacks.
- O projeto fica consistente com multi-tenant e sem recursão em policy.

Detalhes técnicos
```text
Frontend atual
  -> tenta buscar organization_id
  -> pode falhar por RLS em organizations/user_profiles
  -> tenta insert em lead_campaigns
  -> banco rejeita por policy/constraint
  -> UI mostra erro genérico

Correção ideal
  auth user
    -> função security definer resolve org/role
    -> policies de lead_campaigns aceitam insert somente na org correta
    -> frontend envia payload simples
    -> insert passa com segurança
```

Ordem de implementação que eu seguiria
1. Inspecionar schema/policies reais de `lead_campaigns` e `organizations`
2. Corrigir recursão de `user_profiles`
3. Criar funções auxiliares seguras para org/role
4. Aplicar policies corretas nas tabelas de leads
5. Ajustar frontend para parar de usar fallback e mostrar erro real
