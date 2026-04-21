

## Sincronização automática de entrada em grupo (UAZAPI → Funil)

Hoje, quando alguém entra no grupo após o convite, o card do lead não muda de etapa automaticamente — você está fazendo no botão "Aplicar movimentação". Isso acontece porque o webhook de eventos de grupo da UAZAPI não está chegando ou não está sendo interpretado corretamente. Vou consertar a ponta a ponta.

### O que está quebrado

1. **Webhook da UAZAPI não está cadastrado para eventos de grupo.** A função `enable_webhook` envia um body que a UAZAPI v2 não respeita totalmente — só registra `messages`. Eventos `groups` ficam silenciosos.
2. **Roteamento no `uazapi-webhook` é frágil.** Só encaminha para `wz-group-sync` se `eventType` contiver a string "group", mas a UAZAPI também manda eventos relevantes como `presence`, `chats` e payloads com `EventType: "groups"` em PascalCase que estão sendo ignorados em alguns casos.
3. **`handleWebhookEvent` não reconhece o formato real da UAZAPI v2.** Ele procura `payload.action` em lowercase, mas a UAZAPI manda `Action: "add"`, `Participants: [...]` em PascalCase, e às vezes o participante vem em `payload.message.sender_pn` quando é o próprio bot que adicionou. Também procura match por telefone só em `leads.phone`, ignorando `unified_customers.primary_phone` (que é o que o webhook de mensagens usa).
4. **Sem rastreabilidade.** Quando o webhook chega e não casa, não dá pra saber se foi a UAZAPI que não mandou, se o telefone não bateu ou se a config estava desligada.

### O que vou implementar

**1. Corrigir o registro do webhook na UAZAPI (`wz-group-sync` → `enable_webhook`)**
- Trocar a chamada para o formato correto da UAZAPI v2 (`POST /instance/updateWebhook` com `addUrl`, `events: ["messages","messages_update","connection","groups","presence","chats"]`).
- Garantir que `groups` esteja sempre incluído quando a config tem `auto_move_on_join` ou `auto_move_on_leave`.
- Chamar `enable_webhook` automaticamente quando o usuário salvar a config com automação ligada (hoje é manual).

**2. Reescrever o roteamento no `uazapi-webhook`**
- Detectar evento de grupo por múltiplos sinais: `EventType` em `["groups","group_participants","group.participants.update","presence"]`, presença de `payload.groupjid/GroupJID/chatid` terminando em `@g.us`, ou `payload.Participants`.
- Encaminhar para `wz-group-sync` em modo `webhook_event` mantendo o payload original.
- Logar no `webhook_audit` (já existente) o tipo detectado, para diagnóstico.

**3. Reescrever `handleWebhookEvent` no `wz-group-sync`**
- Extrair ação do payload tratando PascalCase (`Action`, `EventAction`) e os valores reais da UAZAPI: `add`, `remove`, `promote`, `demote`, `invite`, `request`.
- Extrair participantes de `Participants[]`, `participant`, `data.Participants[]` e `message.sender_pn`.
- Fazer match de telefone em duas fontes: `leads.phone` (atual) e `unified_customers.primary_phone` via `lead_stage_positions → leads.unified_customer_id`. Usar `phoneVariations` em ambas.
- Quando for `add/join`: mover para `in_group_stage_id` se `auto_move_on_join = true`.
- Quando for `remove/leave`: mover para `left_group_stage_id` se `auto_move_on_leave = true`.
- Sempre gravar em `lead_funnel_group_sync_runs` com `mode='webhook_event'`, mesmo quando não casar — incluindo os telefones recebidos no `payload`, para você diagnosticar.

**4. UI: aviso de status do webhook**
- Em `WhatsAppGroupSyncConfig.tsx`, adicionar um indicador "Monitoramento ativo" verde quando o webhook estiver registrado, e botão "Reativar monitoramento" se a UAZAPI rejeitar.
- Mostrar últimas 5 execuções do tipo `webhook_event` (já existem na tabela `lead_funnel_group_sync_runs`) com participante, ação e resultado, para você ver em tempo real se está chegando.

### Análise específica do funil "[LANC] O Poder Holistico das Ervas"

Junto com as mudanças, vou verificar:
- Se a config de sincronização desse funil tem `auto_move_on_join = true` e `in_group_stage_id` apontando para a etapa correta.
- Se o webhook da UAZAPI está realmente registrado na instância usada (chamando `GET /webhook` para listar).
- Se há registros recentes em `webhook_audit` com payloads de grupo para essa instância (confirma se a UAZAPI está mandando ou não).

Faço esse diagnóstico antes de aplicar, e te mostro o que encontrei junto com a correção.

### Detalhes técnicos

- **Arquivos editados:**
  - `supabase/functions/uazapi-webhook/index.ts` — detecção robusta de eventos de grupo + audit log.
  - `supabase/functions/wz-group-sync/index.ts` — `handleWebhookEvent` reescrito + `enable_webhook` corrigido + match via `unified_customers`.
  - `src/components/lead-funnels/WhatsAppGroupSyncConfig.tsx` — chamar `enable_webhook` no save + bloco de status/últimos eventos.
  - `src/hooks/useWzGroupSync.ts` — novo hook `useWzGroupSyncRuns(funnelId)` para listar execuções recentes.
- **Sem migration nova** — `lead_funnel_group_sync_runs` já tem todas as colunas necessárias.
- **Deploy:** `wz-group-sync` e `uazapi-webhook` (ambas Edge Functions).

