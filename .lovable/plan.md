

## Resposta curta: NÃO mude o `instance_name`

O campo `instance_name` é o identificador técnico usado na API UAZAPI (a action `update_instance_name` altera o nome lá). Mudar ele pode quebrar integrações.

O campo `display_name` já existe na tabela `whatsapp_instances` — ele vem do perfil do WhatsApp (nome do WhatsApp tipo "Equipe Matheus Colombo"). Por isso todas as instâncias mostram o mesmo nome no dropdown.

## Solução: adicionar campo `nickname` na tabela

Um novo campo `nickname` (apelido) editável pelo admin, independente do nome técnico e do nome do WhatsApp. A prioridade de exibição em toda a UI seria:

**`nickname` → `display_name` → `instance_name`**

### Mudanças

1. **Migration**: `ALTER TABLE whatsapp_instances ADD COLUMN nickname text;`

2. **Interface de edição** (`InstanceManagement.tsx`): Adicionar campo "Apelido" acima do nome da instância, com botão de salvar que faz `UPDATE whatsapp_instances SET nickname = ... WHERE id = ...`

3. **Exibição em toda UI** — trocar `display_name || instance_name` por `nickname || display_name || instance_name` em:
   - `WhatsAppChat.tsx` (dropdown selector, status bar)
   - `useWhatsAppMultiChat.ts` (tag do chat)
   - `InstanceAccessManager.tsx` (nome da instância)
   - `ChatList.tsx` (badge)

4. **Tipo TypeScript** (`useWhatsApp.ts`): Adicionar `nickname: string | null` na interface `WhatsAppInstance`

### SQL para rodar

```sql
ALTER TABLE public.whatsapp_instances ADD COLUMN nickname text;
```

Só isso. Sem RLS nova porque a tabela já tem suas policies.

