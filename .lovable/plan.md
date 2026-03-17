

## Chat do WhatsApp — Plano de Implementação

Faz total sentido e se encaixa bem no projeto. A base de leads com telefone já existe, o que facilita a vinculação. Vou dividir em fases incrementais.

---

### Pré-requisitos

Antes de codar, preciso de **2 secrets** para as Edge Functions:
- `UAZAPI_BASE_URL` — URL do servidor UAZAPI (ex: `https://api.uazapi.com`)
- `UAZAPI_TOKEN` — Token de autenticação da instância

Também será necessário criar um **storage bucket** `whatsapp-media` para uploads de mídia.

---

### Fase 1 — Banco de dados (migration SQL)

**Tabela `whatsapp_instances`:**
- `id`, `organization_id` (FK), `instance_name`, `phone_number`, `api_url`, `api_token` (encrypted), `display_name`, `profile_pic_url`, `status` (connected/disconnected), `created_at`, `updated_at`
- RLS: `organization_id = get_user_org_id()`

**Tabela `whatsapp_messages`:**
- `id`, `organization_id` (FK), `instance_id` (FK), `phone`, `body`, `message_type` (text/image/audio/video/document), `direction` (inbound/outbound), `status` (pending/sent/delivered/read), `media_url`, `message_id_external` (ID do WhatsApp para dedup), `payload_raw` (jsonb), `is_deleted`, `lead_id` (FK nullable → leads), `created_at`, `updated_at`
- RLS: `organization_id = get_user_org_id()`
- Indexes: `phone`, `instance_id`, `created_at`, `message_id_external`

**Storage bucket:** `whatsapp-media` (público, com policy por org)

---

### Fase 2 — Edge Functions (5 funções)

1. **`whatsapp-chats`** — `action=list_chats` (agrupa por phone, retorna último msg + contagem não lida) e `action=messages&phone=X` (histórico paginado)

2. **`whatsapp-send`** — Envia texto/mídia/PTT via UAZAPI. Grava outbound no banco. Suporta edição e soft delete. Múltiplas tentativas com variações de endpoint.

3. **`whatsapp-contact-info`** — Busca nome/foto via UAZAPI `/chat/details`

4. **`whatsapp-presence`** — Envia "digitando..." via UAZAPI

5. **`uazapi-webhook`** (`verify_jwt = false`) — Recebe inbound da UAZAPI, grava no banco, tenta vincular ao lead pelo telefone (com tratamento do 9º dígito BR)

---

### Fase 3 — Frontend

**Página `WhatsAppChat.tsx`** — Layout de 3 colunas responsivo:

```text
┌─────────────┬──────────────────────┬─────────────┐
│  Lista de   │   Thread de          │  Painel CRM │
│  Chats      │   Mensagens          │  do Lead    │
│  (300px)    │   (flex-1)           │  (320px)    │
│             │                      │             │
│  • Avatar   │  Bolhas in/out       │  • Tags     │
│  • Nome     │  Tipos de mídia      │  • Funis    │
│  • Preview  │  Status de entrega   │  • Eventos  │
│  • Hora     │  Input + upload      │  • Vendas   │
│             │                      │             │
└─────────────┴──────────────────────┴─────────────┘
```

**Componentes:**
- `ChatList` — lista com polling 10s, busca de contatos em background
- `ChatThread` — renderização por tipo (texto, imagem c/ lightbox, áudio c/ player + velocidade, vídeo, documento)
- `ChatInput` — campo de texto + botão de anexo (upload para storage) + envio
- `ContactPanel` — dados do lead vinculado (reusa componentes existentes de `lead-funnels/`)
- Mensagem otimista com Supabase Realtime para atualizações de status

**Rota:** `/whatsapp` no App.tsx
**Sidebar:** Novo item com ícone MessageCircle na seção de ferramentas

---

### Fase 4 — Integrações

- **Supabase Realtime** no `whatsapp_messages` para atualizar mensagens em tempo real
- **Deduplicação** via `message_id_external` (canonical key)
- **Vinculação de leads** automática pelo telefone (com normalização 9º dígito BR)
- **Layout especial** — a página do WhatsApp usa layout fullscreen (sem header de DateRangePicker)

---

### Detalhes técnicos

- A página WhatsApp terá seu próprio layout (sem o DateRangePicker do AppLayout), pois não faz sentido filtrar chat por data
- Todas as Edge Functions usam CORS headers padrão
- O webhook UAZAPI precisa ser configurado externamente para apontar para `https://emfbocpmphtftqcezaib.supabase.co/functions/v1/uazapi-webhook`
- Tokens da UAZAPI ficam no banco (`whatsapp_instances.api_token`) para suportar múltiplas instâncias, mas o secret global serve como fallback

---

### Ordem de execução

1. Gerar migration SQL (para executar manualmente no SQL Editor)
2. Criar as 5 Edge Functions
3. Criar componentes frontend + página
4. Adicionar rota e sidebar
5. Testar fluxo completo

