

## Compatibilizar webhook-lead com payloads de páginas de captura

### Problema
O payload enviado pela página de captura usa nomes de campos diferentes do esperado pela edge function:

| Página envia | Função espera | Status |
|---|---|---|
| `nome` | `name` | ❌ não reconhece |
| `whatsapp` | `phone` | ❌ não reconhece |
| (nenhum) | `event` | ❌ retorna erro 400 |
| `xcod` | — | ❌ ignorado |
| `utm_source` | `utm_source` | ✅ ok |
| `utm_campaign` | `utm_campaign` | ✅ ok |
| `utm_medium` | `utm_medium` | ✅ ok |
| `utm_content` | `utm_content` | ✅ ok |
| `utm_term` | `utm_term` | ✅ ok |

### Correção

**Arquivo: `supabase/functions/webhook-lead/index.ts`**

Adicionar aliases na extração do body para aceitar ambos os formatos:

```typescript
const phone = body.phone || body.whatsapp || body.telefone || null;
const name = body.name || body.nome || null;
const email = body.email || null;
const event = body.event || 'capture'; // default "capture" se não vier
const xcod = body.xcod || null;
```

- **`event` com fallback `"capture"`** — se a página não mandar `event`, assume `capture` automaticamente (faz sentido pra páginas de captura)
- **`xcod`** salvo no campo `metadata` do lead para rastreamento
- **`whatsapp` / `nome`** como aliases de `phone` / `name`
- Nenhuma mudança no banco, só na edge function

### Detalhes técnicos
- O `xcod` será armazenado em `metadata.xcod` para consulta futura
- O fallback de `event` para `"capture"` significa que a página não precisa enviar esse campo — vai funcionar direto
- Os UTMs já batem, então continuam funcionando normalmente

