

## Problema Crítico Encontrado

O código do `uazapi-webhook/index.ts` tem um **bug fatal**: as variáveis `orgId` e `instanceId` são usadas nas linhas 220-249 mas **nunca são definidas**. Isso causa um `ReferenceError` e a mensagem nunca é salva no banco — por isso o body aparece vazio e o envio falha.

### O que precisa ser corrigido

**1. `uazapi-webhook/index.ts` — Resolver variáveis indefinidas `orgId` e `instanceId`**

O webhook recebe `payload.instanceName` da UAZAPI v2. Precisamos:
- Buscar a instância na tabela `whatsapp_instances` pelo `instance_name` (campo que existe na tabela)
- Extrair `organization_id` e `id` da instância encontrada
- Usar esses valores nas queries subsequentes

```typescript
// Após criar supabaseAdmin, ANTES de extrair dados da mensagem:
const instanceName = payload.instanceName || payload.instance || ''
const { data: instance } = await supabaseAdmin
  .from('whatsapp_instances')
  .select('id, organization_id')
  .eq('instance_name', instanceName)
  .maybeSingle()

if (!instance) {
  console.error('Instance not found for name:', instanceName)
  return new Response(JSON.stringify({ error: 'Instance not found' }), {
    status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  })
}

const instanceId = instance.id
const orgId = instance.organization_id
```

**2. `whatsapp-send/index.ts` — Corrigir autenticação `getClaims`**

O método `supabase.auth.getClaims()` não existe no supabase-js v2. Deve ser substituído por `supabase.auth.getUser()`:

```typescript
// Substituir getClaims por getUser
const { data: userData, error: userErr } = await supabase.auth.getUser()
if (userErr || !userData?.user) {
  return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 })
}
```

### Arquivos alterados
- `supabase/functions/uazapi-webhook/index.ts` — adicionar lookup de instância para definir `orgId` e `instanceId`
- `supabase/functions/whatsapp-send/index.ts` — substituir `getClaims` por `getUser`

