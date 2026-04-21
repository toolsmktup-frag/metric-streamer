

## Corrigir detecção de `webhook_status` (false negativo)

### Diagnóstico
O webhook **ESTÁ registrado** corretamente na UAZAPI:
- URL: `https://emfbocpmphtftqcezaib.supabase.co/functions/v1/uazapi-webhook` ✅
- Eventos: `["messages","messages_update","connection","groups"]` ✅ (inclui `groups`)
- `enabled: true` ✅

Mas o `wz-group-sync` está retornando `registered: false, hasGroups: false`. A lógica de avaliação está olhando os campos errados (`addUrlEvents` / `addUrlTypesMessages`), que são flags secundárias da UAZAPI v2 que vêm `false` por padrão e não indicam se o webhook está ativo.

### O que vou fazer

**1. Corrigir handler `webhook_status` em `supabase/functions/wz-group-sync/index.ts`**
- Trocar a lógica de avaliação para:
  - `registered = true` se existir algum item em `raw[]` com `enabled: true` E `url === expectedUrl`
  - `hasGroups = true` se esse mesmo item tiver `"groups"` no array `events[]`
- Ignorar `addUrlEvents` / `addUrlTypesMessages` (não são indicadores de status, e sim toggles de comportamento).

**2. Validar fim a fim**
- Após o fix, o card "Monitoramento ativo" deve ficar verde na UI.
- Para confirmar que eventos reais de entrada em grupo estão chegando, você adiciona alguém no grupo do WhatsApp e a gente verifica `lead_funnel_group_sync_runs` por linhas com `mode='webhook_event'`.

### Por que isso resolve
A UAZAPI já está mandando os eventos (registro está ok). O problema visual de "não registrado" é só leitura errada do retorno. Depois do fix, se ainda não mover automaticamente, aí o problema é em `handleWebhookEvent` (parsing do payload PascalCase) — mas primeiro precisamos confirmar visualmente que o monitoramento está ativo.

### Detalhes técnicos
- **Arquivo editado:** `supabase/functions/wz-group-sync/index.ts` (apenas o handler `webhook_status`).
- **Sem migration, sem mudança de UI.**
- **Deploy necessário:** `wz-group-sync`.

