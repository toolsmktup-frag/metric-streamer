

## Fase 1: Fundação do Tracking Server-Side

### Escopo (2 entregas isoladas, zero impacto no app atual)

**Entrega 1: Edge Function `track-event`**
- Nova Edge Function em `supabase/functions/track-event/index.ts`
- Recebe POST com payload JSON (visitor_id, UTMs, fbclid, fbc, fbp, gclid, user-agent, resolução, timezone)
- Extrai IP real dos headers (`x-forwarded-for`, `x-real-ip`)
- Por enquanto, retorna 200 OK com log (a tabela `clicks` vem na Fase 2)
- Validação básica do payload
- CORS configurado para aceitar requests das landing pages

**Entrega 2: Script JS para Landing Pages**
- Arquivo estático gerado em `public/tracking/tracker.js` (para download/cópia)
- Gera `visitor_id` UUID e persiste em cookie first-party (1 ano) + localStorage backup
- Captura UTMs: `utm_source`, `utm_medium`, `utm_campaign`, `utm_content`, `utm_term`
- Captura click IDs: `fbclid`, `fbc`, `fbp`, `gclid`
- Coleta fingerprint básico: userAgent, resolução de tela, timezone
- Envia via `navigator.sendBeacon()` com fallback para `fetch()`
- O script é standalone — não depende de React, Tailwind, nem do app

### O que NÃO muda
- Nenhuma página do dashboard é alterada
- Nenhuma tabela existente é modificada
- Nenhum webhook existente é tocado
- Nenhuma Edge Function existente é editada

### Resultado da Fase 1
- Script JS pronto para copiar/colar no `<head>` das LPs
- Endpoint `track-event` rodando no Supabase, recebendo e logando eventos
- Base pronta para a Fase 2 (criar tabela `clicks` e começar a persistir)

