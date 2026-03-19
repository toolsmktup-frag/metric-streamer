

## Problema: Áudio inbound chega como mensagem vazia

### Causa Raiz

A função `extractMessageType(v2Message)` verifica `v2Message.type`, mas a UAZAPI v2 envia áudios com `type` genérico (ex: "chat" ou vazio). A informação real está no objeto `content`:

```json
"content": {
  "PTT": true,
  "URL": "https://mmg.whatsapp.net/...",
  "mimetype": "audio/ogg; codecs=opus"
}
```

Como `type` não contém "audio"/"ptt", a função retorna `'text'`. Com body vazio, o frontend renderiza uma bolha sem conteúdo.

### Correções necessárias

#### 1. Webhook `uazapi-webhook/index.ts` — `extractMessageType`

Adicionar detecção baseada em `content.mimetype` e `content.PTT` como fallback antes de retornar 'text':

```typescript
// Fallback: detect from content object (v2 audio/media)
if (typeof payload.content === 'object' && payload.content) {
  if (payload.content.PTT || payload.content.ptt) return 'audio'
  const mime = (payload.content.mimetype || '').toLowerCase()
  if (mime.includes('audio')) return 'audio'
  if (mime.includes('image')) return 'image'
  if (mime.includes('video')) return 'video'
  if (mime.includes('pdf') || mime.includes('document')) return 'document'
}
```

#### 2. Frontend `ChatThread.tsx` — Detectar tipo real do payload_raw

Para mensagens já salvas como 'text' mas que são realmente áudio, adicionar uma função que re-detecta o tipo a partir de `payload_raw`, e usá-la na renderização:

```typescript
function detectRealMessageType(message: WhatsAppMessage): string {
  if (message.message_type !== 'text') return message.message_type;
  const raw = message.payload_raw;
  if (!raw) return 'text';
  const v2Msg = raw.message || raw;
  if (typeof v2Msg.content === 'object' && v2Msg.content) {
    if (v2Msg.content.PTT || v2Msg.content.ptt) return 'audio';
    const mime = (v2Msg.content.mimetype || '').toLowerCase();
    if (mime.includes('audio')) return 'audio';
    if (mime.includes('image')) return 'image';
    if (mime.includes('video')) return 'video';
  }
  return 'text';
}
```

Atualizar a condição de renderização (linha 264) e `MediaRenderer` para usar o tipo real detectado.

#### 3. Deploy manual

A correção do webhook precisa ser deployada no Supabase Dashboard. O código completo será fornecido.

### Arquivos alterados

- `supabase/functions/uazapi-webhook/index.ts` — melhorar detecção de tipo
- `src/components/whatsapp/ChatThread.tsx` — re-detectar tipo de mensagens já salvas

