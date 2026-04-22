

## Plano: Responder (quote) + Reagir (emoji) no chat WhatsApp

### 1. Backend — edge function `whatsapp-send` (estender)

Hoje (presumido) aceita `{ instance_id, phone, text/media }`. Adicionar dois campos opcionais:

- **`reply_to: { id: string, text?: string, sender?: string }`** → quando presente, monta payload UAZAPI com `replyid` (ID externo da mensagem citada). Endpoint UAZAPI v2: `POST /send/text` (ou `/send/media`) aceita `replyid` no body.
- **`reaction: { message_id: string, emoji: string }`** → novo branch que chama `POST /message/react` da UAZAPI com `{ number, id, text: emoji }`. Emoji vazio (`""`) = remover reação.

Após envio bem-sucedido de reação, fazer **upsert em `whatsapp_messages`** numa coluna nova `reactions jsonb` (ou tabela `whatsapp_message_reactions`) — escolho **coluna `reactions jsonb`** pra simplicidade: array `[{ emoji, from_me, sender, timestamp }]`.

### 2. Banco — migration

Adicionar 2 colunas em `whatsapp_messages`:
- `reactions jsonb DEFAULT '[]'::jsonb` — reações coladas ao balão.
- `reply_to jsonb` — `{ id, text, sender_name }` da mensagem citada (já populado em outbound; pra inbound, parsear `payload_raw.message.quoted` no `uazapi-webhook`).

Atualizar `uazapi-webhook` pra:
- Capturar `message.quoted` (objeto UAZAPI com a mensagem citada) → salvar em `reply_to`.
- Capturar eventos de reação (`messageType === "ReactionMessage"` ou `message.reaction`) → fazer `UPDATE whatsapp_messages SET reactions = reactions || ...` na mensagem original (matched por `message_id_external`).

### 3. Frontend — `ChatThread.tsx`

**Menu de 3 pontos** (já existe pra mídia — estender pra TODOS os balões):
- `MoreVertical` no canto superior do balão (esq pra outbound, dir pra inbound — espelhado).
- `DropdownMenu` com itens:
  - **Responder** (`Reply` icon) → seta `replyingTo` no estado do componente pai (`WhatsAppChat` ou equivalente).
  - **Reagir** (`Smile` icon) → abre popover com 6 emojis rápidos (`👍 ❤️ 😂 😮 😢 🙏`) + botão "..." pra picker completo (escopo v1: só os 6 rápidos, picker completo fica pra depois).
  - **Copiar** (texto, se houver).
  - Itens existentes de mídia (Visualizar/Baixar) quando aplicável.

**Reações renderizadas no balão:**
- Pequena pílula no canto inferior do balão mostrando emoji(s) + count se >1 do mesmo.
- Click na própria reação (se `from_me`) remove ela.

**Preview de "respondendo a"** acima do input (`MessageInput.tsx` ou similar):
- Card cinza com barra colorida lateral, nome do sender + trecho da mensagem citada (max 2 linhas), botão X pra cancelar.
- Ao enviar, inclui `reply_to: { id, text, sender }` no payload.

**Quote renderizado dentro do balão** (quando msg recebida tem `reply_to`):
- Bloco menor encostado no topo do balão, fundo levemente diferente, barra lateral colorida, sender + texto truncado. Click rola até a mensagem original (best-effort: scroll pra `data-msg-id`).

### 4. Hook `useSendMessage` (ou `useWhatsAppSend`)

Estender pra aceitar `replyTo` e ter método separado `reactToMessage(messageId, emoji)`. Optimistic update: insere reação no cache do React Query antes da resposta do servidor.

### Arquivos editados/criados

**Backend:**
- `supabase/functions/whatsapp-send/index.ts` — branches `reply_to` + `reaction`.
- `supabase/functions/uazapi-webhook/index.ts` — parse `quoted` e `ReactionMessage`.
- Migration: `ALTER TABLE whatsapp_messages ADD COLUMN reactions jsonb DEFAULT '[]'::jsonb, ADD COLUMN reply_to jsonb;`

**Frontend:**
- `src/components/whatsapp/ChatThread.tsx` — menu 3 pontos universal + render de reações + render de quote.
- `src/components/whatsapp/MessageInput.tsx` (ou similar) — preview "respondendo a".
- `src/components/whatsapp/QuickReactionPicker.tsx` (novo) — popover com 6 emojis.
- Hook de envio — adicionar `reactToMessage` e suporte a `replyTo`.

### Validação

1. Click ⋮ no balão → menu abre com Responder/Reagir/Copiar.
2. Click Responder → preview aparece sobre o input; envio inclui citação; mensagem recebida do outro lado mostra como reply.
3. Click Reagir → emoji escolhido aparece colado no balão; outro WhatsApp recebe a reação.
4. Reação recebida via webhook aparece automaticamente no balão (realtime).
5. Reply recebido renderiza quote dentro do balão.

### Fora de escopo (v2)
- Picker completo de emoji (mil emojis).
- Múltiplas reações por usuário diferente no mesmo chat (1:1 só tem você + contato, então é trivial).
- Long-press mobile / swipe-to-reply.
- Editar/deletar mensagem.

