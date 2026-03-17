

## Diagnóstico

O problema é claro agora. A migration do `docs/migration-lead-funnels.sql` **nunca foi executada no banco** — ela está apenas como arquivo de referência em `docs/`, não em `supabase/migrations/`. Isso significa:

1. As tabelas `lead_campaigns`, `lead_funnels`, etc. **podem não existir** no banco
2. A função `get_user_org_id()` **pode não existir**
3. Mesmo que as tabelas existam (criadas manualmente), as RLS policies dependem de `get_user_org_id()` que consulta `user_profiles` — e a policy "Admin reads org profiles" em `user_profiles` tem **recursão infinita**

A causa raiz é a **policy recursiva** na migration `20260311150000_etapa1_foundation.sql` (linhas 49-58):
```sql
CREATE POLICY "Admin reads org profiles"
  ON public.user_profiles FOR SELECT TO authenticated
  USING (
    organization_id = (
      SELECT organization_id FROM public.user_profiles WHERE id = auth.uid()
    )
  );
```
Ela consulta `user_profiles` dentro da própria policy de `user_profiles` = recursão infinita.

### Sobre usar Cloud vs Supabase externo

Seu projeto já usa um Supabase externo. O Cloud não é necessário. O que preciso é **criar uma migration SQL** no repositório que será aplicada ao seu banco.

## Plano de Correção

### 1. Nova migration: corrigir recursão + criar função segura

Criar `supabase/migrations/20260317020000_fix_rls_and_lead_tables.sql` com:

- **Função `get_user_org_id()` SECURITY DEFINER** — busca `organization_id` de `user_profiles` sem passar por RLS
- **Remover policy recursiva** "Admin reads org profiles" de `user_profiles`
- **Recriar policy de admin** usando a função segura
- **Garantir tabelas de leads existem** (IF NOT EXISTS) com as policies corretas

### 2. Ajustar frontend para mostrar erro real + usar `get_user_org_id` via RPC

Em `useLeadCampaigns.ts`:
- Chamar `supabase.rpc('get_user_org_id')` em vez de tentar buscar da tabela `organizations`
- Mostrar a mensagem real do erro no toast

Em `LeadCampaigns.tsx`:
- Passar o `error.message` do Supabase no toast

### 3. Mesma correção em `useLeadFunnels.ts`

Alinhar a mesma lógica de busca de org via RPC.

### Detalhes técnicos da migration

```sql
-- 1. Criar/substituir função segura (SECURITY DEFINER = bypassa RLS)
CREATE OR REPLACE FUNCTION public.get_user_org_id()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$ SELECT organization_id FROM public.user_profiles WHERE id = auth.uid() $$;

-- 2. Remover policy recursiva
DROP POLICY IF EXISTS "Admin reads org profiles" ON public.user_profiles;

-- 3. Recriar com função segura
CREATE POLICY "Admin reads org profiles" ON public.user_profiles
FOR SELECT TO authenticated
USING (organization_id = public.get_user_org_id());

-- 4. Garantir tabelas de leads (CREATE IF NOT EXISTS + policies)
-- (todas as tabelas do docs/migration-lead-funnels.sql)
```

### Resultado esperado

- `get_user_org_id()` funciona sem recursão (SECURITY DEFINER)
- INSERT em `lead_campaigns` passa quando `organization_id` = org do usuário
- Frontend usa RPC limpo, sem fallback hardcoded

