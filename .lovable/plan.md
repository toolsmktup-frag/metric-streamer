

## Corrigir bug de schema + colar conteúdo das edge functions

### Bug identificado
O frontend chama `mode: 'list_runs'` e `mode: 'webhook_status'` no `wz-group-sync`, mas o Zod schema dessa função só aceita até `'webhook_event'`. Por isso a UI quebra com erro 400 na tela de configuração de grupos.

### O que vou fazer

**1. Corrigir o Zod schema em `supabase/functions/wz-group-sync/index.ts`**
- Adicionar `'list_runs'` e `'webhook_status'` ao enum de `mode`.
- Confirmar que os handlers desses dois modos existem (eles já são chamados pelos hooks `useWzGroupSyncRuns` e `useWzWebhookStatus`); se algum não existir, implementar:
  - `list_runs`: retorna últimas 20 linhas de `lead_funnel_group_sync_runs` filtradas pelo `funnel_id`.
  - `webhook_status`: chama `GET /instance/webhook` (ou equivalente UAZAPI v2) e retorna `{ registered, hasGroups, expectedUrl, raw }`.

**2. Colar no chat o conteúdo final completo dos dois arquivos**
- `supabase/functions/wz-group-sync/index.ts` (573 linhas, já com a correção)
- `supabase/functions/uazapi-webhook/index.ts` (541 linhas)

Vou colar em dois blocos ```ts separados, sem cortes, pra você copiar direto.

### Detalhes técnicos
- **Arquivos editados:** `supabase/functions/wz-group-sync/index.ts`
- **Sem migration, sem mudança de UI.**
- **Deploy necessário:** `wz-group-sync` (Edge Function).

