

## Plano: aliviar `whatsapp-chats` no front + back

Os índices já estão no banco. Agora preciso impedir que o front dispare requisição nova enquanto a anterior ainda está rodando, e enxugar mais a edge function.

### 1. Travar polling concorrente nos hooks

**`src/hooks/useWhatsAppMultiChat.ts`**
- Adicionar `inFlight = useRef(false)`
- No início de `fetchAllChats`: se `inFlight.current === true`, retornar sem disparar
- Marcar `true` antes do `fetch`, `false` no `finally`
- Aumentar intervalo de polling de 15s → 20s

**`src/hooks/useWhatsApp.ts`** (`useWhatsAppChats`)
- Mesma trava de `inFlight`
- Mesmo intervalo 20s

Isso resolve o efeito “pile-up” quando uma chamada demora 30-40s e o front já disparou outras 2 por cima.

### 2. Enxugar `supabase/functions/whatsapp-chats/index.ts`

- Reduzir limite de mensagens varridas:
  - unified (`instance_id=all`): 500 → 300
  - single instance: 300 → 200
- Garantir que o `select` continua sem `payload_raw`
- Confirmar que o erro serializa via `serializeError` (sem voltar `[object Object]`)
- Bump de versão pra forçar redeploy

### 3. O que NÃO entra agora

- Tabela de resumo de threads pré-calculada (só se ainda falhar depois desses 2 ajustes)
- Mudança de RLS / permissões (já feito em etapas anteriores)

### Arquivos tocados

- `src/hooks/useWhatsAppMultiChat.ts`
- `src/hooks/useWhatsApp.ts`
- `supabase/functions/whatsapp-chats/index.ts`

### Resultado esperado

- Sem mais 504 por requisições empilhadas
- Sem mais 546 por sobrecarga do worker
- Erros reais aparecendo como string legível, não `[object Object]`
- Lista de chats carrega em tempo aceitável mesmo nas instâncias pesadas

