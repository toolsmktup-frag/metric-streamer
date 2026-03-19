

## Plano: Fluxo de aprovação de novos usuários

### Problema atual
Quando um novo usuário cria conta, ele entra direto no sistema sem aprovação do admin. Não existe campo de status nem trigger para criar o perfil automaticamente.

### Mudanças

#### 1. SQL no Supabase (você precisará rodar)

**a) Adicionar coluna `status` na tabela `user_profiles`:**
```sql
ALTER TABLE public.user_profiles 
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'pending'
  CHECK (status IN ('pending', 'active', 'blocked'));
```

**b) Atualizar role CHECK para incluir 'vendedor' e 'suporte'** (atualmente só aceita 'admin', 'gestor', 'vendedora'):
```sql
ALTER TABLE public.user_profiles DROP CONSTRAINT IF EXISTS user_profiles_role_check;
ALTER TABLE public.user_profiles ADD CONSTRAINT user_profiles_role_check 
  CHECK (role IN ('admin', 'gestor', 'vendedor', 'vendedora', 'suporte'));
```

**c) Criar trigger para auto-criar perfil no signup com status='pending':**
```sql
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.user_profiles (id, organization_id, role, status, full_name)
  VALUES (
    NEW.id,
    '00000000-0000-0000-0000-000000000001', -- SoulNaturi default
    'vendedor',
    'pending',
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email)
  );
  RETURN NEW;
END;
$$;

CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
```

**d) Marcar usuários existentes como ativos:**
```sql
UPDATE public.user_profiles SET status = 'active' WHERE status = 'pending';
```

**e) Policy para admin atualizar status de membros da org:**
```sql
CREATE POLICY "Admin updates org profiles"
  ON public.user_profiles FOR UPDATE TO authenticated
  USING (
    organization_id = public.get_user_org_id()
    AND public.get_user_role() = 'admin'
  )
  WITH CHECK (
    organization_id = public.get_user_org_id()
    AND public.get_user_role() = 'admin'
  );
```

#### 2. `src/components/ProtectedRoute.tsx`
- Após confirmar sessão, buscar `user_profiles.status`
- Se `status = 'pending'` → mostrar tela "Aguardando aprovação do administrador" com botão de logout
- Se `status = 'blocked'` → mostrar tela "Acesso bloqueado" com botão de logout
- Só liberar acesso se `status = 'active'`

#### 3. `src/hooks/useTeamMembers.ts`
- Incluir `status` no select e na interface `TeamMember`
- Adicionar mutation `updateStatus` para aprovar/bloquear

#### 4. `src/pages/Equipe.tsx`
- Adicionar seção "Pendentes de aprovação" no topo com badge de contagem
- Mostrar botões "Aprovar" (✓) e "Rejeitar" (✗) para cada pendente
- Ao aprovar: status → 'active', criar registro em `user_permissions` com todos módulos habilitados
- Ao rejeitar: deletar perfil ou marcar como 'blocked'
- Na tabela principal, mostrar badge de status (ativo/bloqueado)

#### 5. `src/integrations/supabase/types.ts`
- Adicionar `status` ao tipo `user_profiles`

### Fluxo esperado
1. Novo usuário faz signup → trigger cria perfil com `status: 'pending'`
2. Usuário vê tela "Aguardando aprovação"
3. Admin vê notificação na página Equipe → aprova e configura módulos
4. Usuário recarrega → acessa o sistema normalmente

