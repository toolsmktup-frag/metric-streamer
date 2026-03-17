

## Diagnostico: Formato do Payload UAZAPI v2 Incompativel

### Problema Encontrado

Os logs confirmam que o webhook **esta recebendo** as mensagens da UAZAPI. O problema e que o codigo nao entende o formato do payload v2.

O payload v2 da UAZAPI envia:
```json
{
  "BaseUrl": "https://tracker1.uazapi.com",
  "EventType": "messages",
  "chat": { "id": "r806119a5f3c39d", ... }
}
```

Mas o nosso codigo procura:
- `payload.event` (minusculo) -- **nao encontra** `EventType` (maiusculo)
- `payload.data`, `payload.message`, `payload.messages` -- **nao encontra** `chat`
- Resultado: `eventType = ""`, `isMessage = false` → mensagem ignorada

### Plano de Correcao

**1. Adicionar log completo do payload** (temporario, para debug)
- Aumentar o truncamento de 500 para 2000 caracteres para ver a estrutura completa do payload v2, especialmente onde ficam o telefone, corpo da mensagem e key

**2. Corrigir deteccao de EventType**
```typescript
// Antes (nao funciona com v2):
const eventType = payload.event || payload.type || ''

// Depois (suporta v2 + legacy):
const eventType = payload.EventType || payload.event || payload.type || ''
```

**3. Corrigir deteccao de isMessage**
- Adicionar `payload.chat` como condicao valida para mensagem
- Aceitar `EventType === 'messages'` como evento de mensagem

**4. Corrigir extracao de dados da mensagem**
- Extrair dados de `payload.chat` quando disponivel (v2)
- O `chat.id` do v2 pode conter o JID ou telefone em outro campo (ex: `chat.phone`, `chat.jid`)
- Extrair `key`, `message`, `pushName` do objeto correto

**5. Extracao de phone**
- Tentar multiplos caminhos: `chat.id`, `chat.phone`, `chat.jid`, `key.remoteJid`
- Limpar sufixos `@s.whatsapp.net`, `@c.us`

### Nota Importante
O payload v2 esta truncado nos logs (500 chars). Precisamos ver a estrutura completa para saber exatamente onde estao o telefone e o conteudo da mensagem. A primeira acao sera aumentar o log e fazer um novo teste para capturar o payload completo. Alternativamente, voce pode me enviar um screenshot dos logs com o payload completo da UAZAPI.

### Alteracoes em Arquivos
- `supabase/functions/uazapi-webhook/index.ts` -- corrigir parsing do payload v2

