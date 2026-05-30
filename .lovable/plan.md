## Problema

A página `/captura` envia pro nosso `webhook-lead` um payload com `event: "abandoned_cart"` (por isso o card do Lucas aparece com essa tag). O `webhook-lead` cria o lead direitinho no Kanban, mas depois encaminha pro `wz-receiver` usando exatamente esse mesmo nome:

```ts
status: event   // = "abandoned_cart"
```

A "Automação - Influencers" tem trigger configurado pra **`signup`**. No `wz-receiver` (linha 352) a comparação é estrita: `triggerType !== event.status` → não bate → nenhuma execução criada → nada chega no n8n.

É exatamente isso que explica por que o lead aparece no funil mas a automação não dispara e as "últimas execuções" param em 04:52.

## Correção

Mapear no `webhook-lead`, **antes do forward pro wz-receiver**, qualquer evento de entrada de lead (capture/optin/lead/abandoned_cart/etc.) para o nome canônico **`signup`**. O evento original continua sendo gravado em `lead_events` (preserva histórico e tag no card) — só o que vai pro motor de automação é normalizado.

### Alteração única em `supabase/functions/webhook-lead/index.ts`

Adicionar logo antes do bloco "Forward lead events" (linha 200):

```ts
// Map lead-capture events to canonical 'signup' for the automation engine.
// The original event name is preserved in lead_events (tag in the card).
const LEAD_CAPTURE_EVENTS = new Set([
  'capture', 'optin', 'lead', 'signup', 'abandoned_cart', 'cart_abandoned',
])
const automationStatus = LEAD_CAPTURE_EVENTS.has(event) ? 'signup' : event
```

E trocar no body do forward:
```ts
status: automationStatus,
event: automationStatus,
```

Mantém `metadata.original_event = event` pra não perder rastreio.

## Por que essa abordagem

- Não exige mudar a página `vivendonatural` (que está fazendo o trabalho dela certinho).
- Não exige reconfigurar trigger da automação (continua semântico = `signup`).
- Não quebra nenhum outro caminho: `purchase`, `pix_generated`, etc. (que entram por outros webhooks como `ticto-webhook`, `guru-webhook`) continuam passando direto, sem mapeamento.
- A tag `abandoned_cart` no card continua aparecendo (vem de `lead_events`, não do forward).

## Validação

Depois do deploy manual da edge function no Supabase Dashboard:
1. Apaga o Lucas do funil pelo ContactPanel.
2. Faz novo cadastro em `vivendonatural.lovable.app/captura`.
3. Confere em **Automações do Funil → Últimas execuções** se aparece uma nova entrada com status `completed` (ou `running`).
4. Confere se o n8n recebeu o disparo.

## Detalhes técnicos

- Único arquivo alterado: `supabase/functions/webhook-lead/index.ts` (~6 linhas).
- Deploy: **manual** no Supabase Dashboard (regra do projeto — edge functions não são auto-deployadas).
- Nenhuma migration, nenhuma mudança no `wz-receiver`/`wz-executor`, nenhuma mudança de UI.
