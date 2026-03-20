

## Impersonar Usuário (Acessar como vendedor)

### O que será construído

Na página **Equipe**, cada membro terá um botão **"Acessar como"** (visível apenas para admins). Ao clicar, o sistema gera um magic link via Edge Function e abre numa **nova aba**, permitindo ao admin navegar como aquele usuário sem precisar da senha. A sessão original do admin permanece intacta na aba atual.

### Como funciona

1. Admin clica "Acessar como" no membro desejado
2. Frontend chama Edge Function `impersonate-user` com o `user_id`
3. Edge Function valida que o caller é admin, então usa `supabase.auth.admin.generateLink({ type: 'magiclink', email })` para gerar um link de login
4. Frontend abre o link numa nova aba → usuário é logado automaticamente
5. Admin testa na nova aba, fecha quando terminar

### Arquivos

**Novo: `supabase/functions/impersonate-user/index.ts`**
- Valida que o caller é admin (via user_profiles.role)
- Busca o email do user_id alvo
- Gera magic link com `auth.admin.generateLink`
- Retorna a URL de login

**Editar: `src/pages/Equipe.tsx`**
- Adicionar botão "Acessar como" (ícone `LogIn`) na linha de cada membro
- Visível apenas para admins
- Ao clicar: chama a edge function, abre o link retornado em `window.open(url, '_blank')`

### Segurança

- Apenas usuários com `role = 'admin'` podem usar
- A verificação é feita no servidor (Edge Function), não no client
- O magic link é single-use e expira em minutos

