

## Correção de bugs no track-event e webhook-lead

### Bug 1: track-event insere colunas erradas no lead_events (CRÍTICO)
No `supabase/functions/track-event/index.ts` linhas 177-183, o insert usa:
- `event_type` → deveria ser `event_name`
- `new_stage_id` → não existe na tabela
- `source` → não existe na tabela
- Falta `funnel_id` (obrigatório)

Isso faz o insert falhar silenciosamente — o lead é movido de etapa mas o evento **não aparece na timeline**.

**Fix**: Corrigir para:
```typescript
await supabase.from("lead_events").insert({
  lead_id: leadId,
  funnel_id: funnelId,
  event_name: "stage_change",
  metadata: { 
    source: "tracking_pageview",
    visitor_id: visitorId, 
    page_url: cleanRecord.page_url,
    to_stage_id: stageId 
  },
});
```

### Bug 2: webhook-lead não captura `sck`
O payload traz `sck` (tracking concatenado) mas o webhook-lead só extrai `xcod`. Adicionar `sck` ao metadata.

**Fix** em `supabase/functions/webhook-lead/index.ts`:
```typescript
const sck = body.sck || null;
const metadata = { 
  ...(body.metadata || {}), 
  ...(xcod ? { xcod } : {}),
  ...(sck ? { sck } : {}) 
};
```

### Arquivos alterados
1. `supabase/functions/track-event/index.ts` — corrigir colunas do lead_events insert
2. `supabase/functions/webhook-lead/index.ts` — adicionar `sck` ao metadata

