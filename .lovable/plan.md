

## Fase 3 (revisada): Meta CAPI com Pixel por Funil

### Mudança de abordagem
Em vez de um único `META_PIXEL_ID` como secret global, cada **lead funnel** terá seus próprios campos de configuração Meta (pixel_id + access_token). A Edge Function `meta-capi-sync` buscará essas credenciais do funil correspondente.

### Implementação

**1. Migration: adicionar colunas Meta ao `lead_funnels`**
```sql
ALTER TABLE lead_funnels
  ADD COLUMN meta_pixel_id TEXT DEFAULT NULL,
  ADD COLUMN meta_access_token TEXT DEFAULT NULL;
```

**2. UI: campos Meta Pixel na aba Config do funil**
- Adicionar dois inputs no `FunnelConfigTab.tsx`: "Meta Pixel ID" e "Meta Access Token"
- Salvar via `updateFunnel` existente (já faz UPDATE na tabela `lead_funnels`)
- Access token exibido como `type="password"` por segurança

**3. Edge Function `meta-capi-sync/index.ts`**
- Recebe: `email`, `phone`, `amount_cents`, `currency`, `order_id`, `product_name`, `event_name`, `funnel_id`
- Busca `meta_pixel_id` e `meta_access_token` do `lead_funnels` pelo `funnel_id`
- Se não tiver pixel configurado, loga e retorna (sem erro)
- Busca na tabela `clicks` o registro mais recente com esse email para enriquecer com: `ip_address`, `user_agent`, `fbp`, `fbc`
- Hash SHA-256 em email/phone
- Envia para `graph.facebook.com/v21.0/{pixel_id}/events`
- Loga resultado em `meta_capi_log`

**4. Migration: tabela `meta_capi_log`**
- Colunas: `id`, `funnel_id`, `event_name`, `event_id`, `email_hash`, `order_id`, `pixel_id`, `status`, `meta_response`, `created_at`

**5. Modificar webhooks (ticto, eduzz, guru)**
- Após `sync_lead_from_sale`, buscar os funnel_ids onde o lead foi posicionado
- Para cada funil com `meta_pixel_id` configurado, chamar `meta-capi-sync`
- Chamada await (não fire-and-forget, conforme regra do projeto)

### Arquivos

| Arquivo | Ação |
|---------|------|
| `supabase/migrations/xxx_lead_funnels_meta_pixel.sql` | Criar — ADD COLUMN meta_pixel_id, meta_access_token |
| `supabase/migrations/xxx_meta_capi_log.sql` | Criar — tabela de auditoria |
| `src/types/leadFunnels.ts` | Modificar — adicionar `meta_pixel_id`, `meta_access_token` ao tipo |
| `src/components/lead-funnels/FunnelConfigTab.tsx` | Modificar — inputs Meta Pixel ID + Access Token |
| `supabase/functions/meta-capi-sync/index.ts` | Criar — Edge Function principal |
| `supabase/functions/ticto-webhook/index.ts` | Modificar — chamar meta-capi-sync |
| `supabase/functions/eduzz-webhook/index.ts` | Modificar — chamar meta-capi-sync |
| `supabase/functions/guru-webhook/index.ts` | Modificar — chamar meta-capi-sync |

### Vantagens
- Cada funil/produto pode ter pixel diferente
- Sem secrets globais para gerenciar
- Escala para N pixels sem reconfiguração de ambiente

