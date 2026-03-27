

## Plano: Botao de reset de senha pelo admin na pagina Equipe

### Como funciona
O Supabase nao permite que admins definam uma nova senha diretamente pelo client-side. A abordagem segura e gerar um **link de reset de senha** via `auth.admin.generateLink({ type: 'recovery', email })` numa Edge Function, e o admin copia/envia esse link ao usuario.

### Mudancas

**1. Nova Edge Function `supabase/functions/admin-reset-password/index.ts`**
- Recebe `{ user_id }` no body
- Valida que o caller e admin (mesma logica do `impersonate-user`)
- Busca o email do usuario via `auth.admin.getUserById()`
- Gera link de recovery via `auth.admin.generateLink({ type: 'recovery', email })`
- Retorna `{ url }` para o frontend

**2. `src/pages/Equipe.tsx` — Adicionar botao de reset na coluna Acoes**
- Novo icone (KeyRound ou similar) ao lado dos botoes existentes (editar, permissoes, impersonar)
- Visivel apenas para admins
- Ao clicar: chama a Edge Function, copia o link para clipboard e mostra toast "Link de reset copiado!"
- Alternativa: abre dialog perguntando se quer copiar o link ou abrir em nova aba

### Resultado
- Admin clica no botao de reset ao lado do membro
- Recebe um link magic de recovery que pode enviar ao usuario via WhatsApp/email
- O usuario clica no link e define uma nova senha

