

## Plano: Criar página de Reset de Senha

### Problema
O link de recovery gerado pelo `admin-reset-password` redireciona ao site com um token `type=recovery` no hash da URL. Como não existe uma rota `/reset-password`, o usuário cai no login normal.

### Mudanças

**1. Novo arquivo `src/pages/ResetPassword.tsx`**
- Detecta o token `type=recovery` no hash da URL
- Mostra formulário com "Nova senha" + "Confirmar senha"
- Chama `supabase.auth.updateUser({ password })` ao submeter
- Exibe toast de sucesso e redireciona para `/resumo`

**2. `src/App.tsx` — Adicionar rota pública**
- Rota `/reset-password` apontando para `ResetPassword` (fora do `Protected`)

**3. `supabase/functions/admin-reset-password/index.ts` — Ajustar redirect**
- O `generateLink` gera um link que por padrão aponta para o site root
- O link precisa incluir redirect para `/reset-password` — mas como `generateLink` não aceita `redirectTo`, vamos manipular a URL retornada para trocar o path de redirect

### Resultado
- Admin gera link → envia pro membro → membro clica → vê formulário "Defina sua nova senha" → salva → entra no sistema

