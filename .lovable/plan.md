

## Mostrar foto do vendedor no card (em vez do nome)

### Problema atual
- O badge com nome do vendedor está aparecendo, mas o email do lead também aparece (bug: o badge do vendedor ficou junto ao email)
- O usuário quer **foto** do vendedor no avatar compacto (que já existe no canto do card), em vez de um badge de texto com o nome

### O que será feito

**1. Adicionar coluna `avatar_url` na tabela `user_profiles`**
- Nova migration: `ALTER TABLE user_profiles ADD COLUMN avatar_url text;`
- Permitirá armazenar URL da foto de cada membro da equipe

**2. Configurar Storage bucket para avatares**
- Criar bucket `avatars` no Supabase (via migration)
- Políticas: usuário autenticado pode fazer upload do próprio avatar; leitura pública

**3. Atualizar `useTeamMembers` para incluir `avatar_url`**
- Adicionar `avatar_url` ao select e à interface `TeamMember`

**4. Upload de foto na página de Equipe**
- Na listagem de membros (ou no perfil), adicionar botão de upload de foto
- Faz upload ao bucket `avatars`, salva URL em `user_profiles.avatar_url`

**5. Atualizar `LeadAssignSelect` (avatar compacto no card)**
- Se o vendedor tem `avatar_url`, mostrar `<AvatarImage>` em vez de iniciais
- Mantém fallback de iniciais quando não há foto

**6. Remover badge de nome do vendedor do `LeadCard.tsx`**
- Remover o bloco `{assignedMember && ...}` que mostra o badge com nome
- O avatar compacto com foto já identifica o vendedor; ao passar o mouse mostra tooltip com nome

### Resultado
- No card: avatar compacto com **foto** do vendedor (ou iniciais como fallback)
- Sem badge de texto extra com nome/email
- Cada vendedor pode ter foto configurada na página de equipe

