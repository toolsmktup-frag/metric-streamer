

## Fase 3: Integração Meta Conversions API (CAPI) e Deduplicação

### Objetivo
Criar uma Edge Function `meta-capi-sync` que envia eventos de **Purchase** enriquecidos para a Meta Conversions API (Graph API), utilizando dados da tabela `clicks` para maximizar o Event Match Quality (EMQ).

### Como funciona

```text
Webhook (Ticto/Eduzz/Guru)
  ↓ salva venda no DB
  ↓ chama sync_lead_from_sale
  ↓ chama meta-capi-sync  ← NOVO
        ↓
        Busca na tabela "clicks" o registro
        mais recente com o email do comprador
        ↓
        Envia evento Purchase para
        graph.facebook.com via Server Event API
        com: email hash, phone hash, ip, user_agent,
        fbp, fbc, external_id (order hash)
```

### Implementação

**1. Nova Edge Function `supabase/functions/meta-capi-sync/index.ts`**
- Recebe: `email`, `phone`, `amount_cents`, `currency`, `order_id`, `product_name`, `event_name` (default: "Purchase")
- Busca na tabela `clicks` o registro mais recente com esse email para resgatar: `ip_address`, `user_agent`, `fbp`, `fbc`, `fbclid`
- Aplica SHA-256 hash em `email` e `phone` (requisito Meta)
- Monta payload no formato Meta Server Events API (Graph API v21.0)
- Envia para `POST /v21.0/{pixel_id}/events` com `access_token`
- Usa `order_id` como `event_id` para deduplicação com pixel client-side
- Loga resultado em tabela `meta_capi_log` (sucesso/erro, fbevent_id)

**2. Nova migration: tabela `meta_capi_log`**
- Colunas: `id`, `event_name`, `event_id`, `email_hash`, `order_id`, `status`, `meta_response`, `created_at`
- Permite auditoria e debug de envios

**3. Secrets necessários**
- `META_PIXEL_ID` — ID do pixel do Meta
- `META_ACCESS_TOKEN` — já existe no projeto (usada pelo sync-meta)

**4. Modificar webhooks existentes para chamar `meta-capi-sync`**
- `ticto-webhook`: após `sync_lead_from_sale`, se status === "authorized", chamar `meta-capi-sync`
- `eduzz-webhook`: idem
- `guru-webhook`: idem
- Chamada fire-and-forget (non-fatal, com try/catch)

### Detalhes técnicos

| Item | Detalhe |
|------|---------|
| Hash | SHA-256 via `crypto.subtle.digest` (nativo Deno) |
| Dedup | `event_id` = order_id/hash garante que Meta ignora duplicatas |
| Match params | `em`, `ph`, `client_ip_address`, `client_user_agent`, `fbp`, `fbc`, `external_id` |
| Fallback | Se não encontrar registro em `clicks`, envia mesmo assim com dados parciais (email+phone) |
| Endpoint | `https://graph.facebook.com/v21.0/{PIXEL_ID}/events` |

### Arquivos a criar/modificar

| Arquivo | Ação |
|---------|------|
| `supabase/functions/meta-capi-sync/index.ts` | Criar — Edge Function principal |
| `supabase/migrations/xxx_meta_capi_log.sql` | Criar — tabela de auditoria |
| `supabase/functions/ticto-webhook/index.ts` | Modificar — adicionar chamada meta-capi-sync |
| `supabase/functions/eduzz-webhook/index.ts` | Modificar — adicionar chamada meta-capi-sync |
| `supabase/functions/guru-webhook/index.ts` | Modificar — adicionar chamada meta-capi-sync |

