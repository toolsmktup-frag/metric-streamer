

## Problema

Não existe tabela `whatsapp_contacts` — o nome do contato (`sender_name`) é salvo **por mensagem** no campo `whatsapp_messages.sender_name`. Quando a última mensagem é outbound, o `sender_name` é null e o nome some da lista.

## Solução: Criar tabela `whatsapp_contacts`

### 1. Nova tabela (migration SQL em `docs/`)

```sql
create table public.whatsapp_contacts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references organizations(id) on delete cascade not null,
  instance_id uuid references whatsapp_instances(id) on delete cascade not null,
  phone text not null,
  name text,
  profile_pic_url text,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique(organization_id, instance_id, phone)
);
alter table public.whatsapp_contacts enable row level security;
-- RLS policies para org members
```

### 2. Webhook: upsert no contato ao receber mensagem inbound

No `uazapi-webhook/index.ts`, após salvar a mensagem, fazer upsert em `whatsapp_contacts` quando `direction === 'inbound'` e houver `senderName`:

```typescript
if (direction === 'inbound' && senderName) {
  await supabaseAdmin.from('whatsapp_contacts')
    .upsert({
      organization_id: orgId,
      instance_id: instanceId,
      phone,
      name: senderName,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'organization_id,instance_id,phone' });
}
```

### 3. Edge function `whatsapp-chats`: join com contacts

No `list_chats`, buscar os contatos e enriquecer a lista:

```typescript
const { data: contacts } = await adminClient
  .from('whatsapp_contacts')
  .select('phone, name, profile_pic_url')
  .eq('organization_id', orgId)
  .eq('instance_id', instanceId);

const contactMap = new Map(contacts?.map(c => [c.phone, c]) || []);

// No loop do chatMap, usar contactMap para preencher sender_name
```

### 4. Também corrigir o fallback no loop atual

Manter o fallback de buscar `sender_name` de mensagens inbound caso o contato ainda não exista na tabela.

### Arquivos alterados
- `docs/whatsapp-contacts-migration.sql` — nova tabela
- `supabase/functions/uazapi-webhook/index.ts` — upsert contato
- `supabase/functions/whatsapp-chats/index.ts` — join com contacts + fallback

