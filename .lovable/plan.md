

## Plano: Menu de perfil do usuario no header + pagina de configuracoes

### Resumo
Adicionar um avatar/botao do usuario no canto superior direito do header (ao lado do botao de refresh). Ao clicar, abre um dropdown com "Configuracoes" e "Sair". A pagina de configuracoes permite: editar nome, ver email (somente leitura), alterar senha e subir foto de perfil.

### Mudancas

**1. Novo componente `src/components/layout/UserMenu.tsx` — Dropdown do usuario**
- Busca dados do usuario logado (nome, email, avatar) via `supabase.auth.getUser()` + `user_profiles`
- Mostra avatar (ou iniciais) no header
- Dropdown com 2 opcoes: "Configuracoes" (navega para `/configuracoes`) e "Sair" (faz logout)

**2. `src/components/layout/AppLayout.tsx` — Adicionar UserMenu ao header**
- Importar e renderizar `<UserMenu />` no lado direito do header, ao lado do botao de refresh

**3. Nova pagina `src/pages/UserSettings.tsx` — Configuracoes do usuario**
- Campo "Nome" — editavel, salva em `user_profiles.full_name`
- Campo "Email" — somente leitura, exibe o email do auth
- Secao "Alterar Senha" — campos "Nova senha" e "Confirmar senha", chama `supabase.auth.updateUser({ password })`
- Secao "Foto de Perfil" — upload de imagem para o bucket `avatars` (ja existe), atualiza `user_profiles.avatar_url`
- Botao "Salvar" para nome/foto, botao separado "Alterar Senha" para a senha

**4. `src/App.tsx` — Rota `/configuracoes`**
- Adicionar rota protegida para `UserSettings`

### Fluxo do usuario
1. Vendedor ve seu avatar no canto superior direito
2. Clica → dropdown com "Configuracoes" e "Sair"
3. "Configuracoes" → pagina onde edita nome, ve email, troca senha e sobe foto
4. "Sair" → logout e redireciona para login

