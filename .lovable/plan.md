

# Fix: Edge Functions crashando por método inexistente

## Causa raiz

Todas as 5 edge functions WhatsApp usam `supabase.auth.getClaims(token)` -- esse método **não existe** no `@supabase/supabase-js@2` (usado via `esm.sh`). Ele foi introduzido apenas na v3. Isso faz as funções crasharem em runtime, resultando no `NetworkError` que você vê.

## Correção

Substituir `getClaims` por `getUser` em todas as 5 edge functions:

**Antes:**
```typescript
const token = authHeader.replace('Bearer ', '')
const { data: claims, error: claimsErr } = await supabase.auth.getClaims(token)
if (claimsErr || !claims?.claims) {
  return new Response(JSON.stringify({ error: 'Unauthorized' }), { ... })
}
```

**Depois:**
```typescript
const { data: { user }, error: userErr } = await supabase.auth.getUser()
if (userErr || !user) {
  return new Response(JSON.stringify({ error: 'Unauthorized' }), { ... })
}
```

Como o client já é criado com o `Authorization` header do request, `getUser()` sem parâmetros já valida o token automaticamente.

## Arquivos afetados (mesma mudança em todos)

1. `supabase/functions/whatsapp-instance/index.ts`
2. `supabase/functions/whatsapp-chats/index.ts`
3. `supabase/functions/whatsapp-send/index.ts`
4. `supabase/functions/whatsapp-presence/index.ts`
5. `supabase/functions/whatsapp-contact-info/index.ts`

## Após a correção

Será necessário fazer **Publish** novamente para redeployar as funções corrigidas.

