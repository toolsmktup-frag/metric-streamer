

## Auto-mover lead de etapa via pageview tracking

### Como funciona hoje
O `track-event` insere na tabela `clicks` e pronto. Não move ninguém.

### O que precisa mudar
Após inserir o click, o `track-event` deve tentar identificar o lead pelo `visitor_id` e movê-lo para a etapa (`stage_id`) do snippet.

### Lógica de identificação
1. Buscar na tabela `clicks` se esse `visitor_id` já tem um `email` capturado (evento `email_capture` anterior)
2. Se sim, buscar o lead pelo email na tabela `leads`
3. Se o lead existir e tiver posição no funil (`lead_stage_positions`), atualizar para o novo `stage_id`
4. Se não tiver posição ainda, criar uma na primeira etapa

### Mudança técnica

**`supabase/functions/track-event/index.ts`** — após o insert na `clicks`:

```text
Se event_type === "pageview" && stage_id && funnel_id:
  1. SELECT email FROM clicks WHERE visitor_id = X AND email IS NOT NULL LIMIT 1
  2. Se achou email → SELECT id FROM leads WHERE email = Y LIMIT 1
  3. Se achou lead → UPSERT lead_stage_positions (lead_id, funnel_id) 
     SET stage_id = Z, entered_at = NOW()
     ON CONFLICT (lead_id, funnel_id) DO UPDATE
  4. INSERT lead_events (stage_change) para registrar a movimentação
```

### Fluxo prático
```text
LP captura: pageview (vid=ABC) → email_capture (vid=ABC, email=fulano@x)
Redirect:   pageview (vid=ABC, stage_id=044ab...) 
            → track-event identifica ABC → email fulano@x → lead → move pra etapa 2
```

### Proteções
- Só executa se `event_type === "pageview"` e ambos `stage_id` + `funnel_id` presentes
- Não bloqueia o response — lógica de movimentação é fire-and-forget (já retorna 200 antes)
- Se não encontrar email ou lead, ignora silenciosamente (só loga)
- Usa `ON CONFLICT` para evitar duplicatas (constraint `unique_lead_per_funnel`)

