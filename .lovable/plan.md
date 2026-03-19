

## Problema: Áudios recebidos (inbound) não aparecem

### Causa Raiz

A UAZAPI v2 envia a URL do áudio dentro de `message.content.URL` (com "URL" em **maiúsculo**), mas o código procura por `content.url` (minúsculo). Resultado: `media_url` fica `null` no banco de dados e o frontend mostra "Áudio não disponível".

Evidência concreta do payload real (visível nas network requests):
```json
"content": {
  "PTT": true,
  "URL": "https://mmg.whatsapp.net/v/t62.7114-24/...",
  "seconds": 3,
  "mimetype": "audio/ogg; codecs=opus"
}
```

Há **dois lugares** para corrigir:

### 1. Edge Function `uazapi-webhook/index.ts` (webhook que salva no banco)

Linha 265 -- adicionar `v2Message.content.URL` (maiúsculo) na cadeia de fallback:
```typescript
mediaUrl = v2Message.content.url || v2Message.content.URL || v2Message.content.mediaUrl || v2Message.content.fileUrl || null
```

Também corrigir a extração do `messageBody` (linha 259): quando `v2Message.content` é um objeto (áudio, imagem), o body fica como `[object Object]`. Deve verificar se é string antes de usar.

### 2. Frontend `ChatThread.tsx` - `extractMediaUrlFromPayload` (fallback para mensagens já salvas sem media_url)

Linha 125-126 -- adicionar `v2Msg.content.URL` na cadeia de fallback:
```typescript
if (v2Msg.content.url || v2Msg.content.URL || v2Msg.content.mediaUrl || v2Msg.content.fileUrl) {
  return v2Msg.content.url || v2Msg.content.URL || v2Msg.content.mediaUrl || v2Msg.content.fileUrl;
}
```

### Nota importante

A correção no webhook (item 1) precisa ser **deployada manualmente** no Supabase Dashboard para que novas mensagens de áudio sejam salvas com a URL correta. A correção no frontend (item 2) garante que áudios já salvos sem `media_url` sejam recuperados do `payload_raw`.

