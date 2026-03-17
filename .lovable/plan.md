

## Plano: Configurar Webhook UAZAPI Automaticamente pela Plataforma

### Problema Encontrado

Analisando a spec OpenAPI v2 da UAZAPI que voce enviou, identifiquei que o codigo atual usa endpoints e nomes de eventos **incorretos**:

| O que temos hoje | O que a API v2 espera |
|---|---|
| `POST /webhook/set` | `POST /webhook` |
| Eventos: `messages.upsert`, `messages.update`, `connection.update` | Eventos: `messages`, `messages_update`, `connection` |
| Webhook event type: `messages.upsert` | Webhook event type: `message` |
| Payload em `payload.message` | Payload em `payload.data` |

### O que sera feito

**1. Corrigir a Edge Function `whatsapp-instance/index.ts`**

- No `case 'connect'`: mudar `POST /webhook/set` para `POST /webhook`
- Corrigir os nomes dos eventos para `['messages', 'messages_update', 'connection']`
- Adicionar `excludeMessages: ['wasSentByApi']` para evitar loops
- No `case 'set_webhook'`: mesmas correcoes de endpoint e eventos

**2. Corrigir a Edge Function `uazapi-webhook/index.ts`**

- Ajustar a deteccao de evento: aceitar `message` (UAZAPI v2) alem de `messages.upsert`
- Ajustar a deteccao de status update: aceitar `status` alem de `messages.update`
- Extrair dados de `payload.data` (formato v2) alem do formato atual
- Ajustar o campo `instance` para fazer match correto com `instance_name` no banco

### Detalhes Tecnicos

**Endpoint correto (modo simples, recomendado pela UAZAPI):**
```
POST {apiUrl}/webhook
Header: token: {apiToken}
Body: {
  "enabled": true,
  "url": "https://emfbocpmphtftqcezaib.supabase.co/functions/v1/uazapi-webhook",
  "events": ["messages", "messages_update", "connection"],
  "excludeMessages": ["wasSentByApi"]
}
```

**Formato do webhook recebido (WebhookEvent):**
```
{
  "event": "message",    // não "messages.upsert"
  "instance": "id-da-instancia",
  "data": { ... }        // dados da mensagem
}
```

Com essas correcoes, ao conectar uma instancia na plataforma o webhook sera configurado automaticamente, sem precisar acessar o painel da UAZAPI.

