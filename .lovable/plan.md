

## Fase 2.5 (Revisão): Diagnosticar e Corrigir Tracking que Não Salva

### Problema Identificado

O tracker.js usa `navigator.sendBeacon()` como método primário de envio. O `sendBeacon`:
- Envia como **preflight-free** (sem CORS OPTIONS)
- Mas o Supabase Edge Functions pode rejeitar requests sem o header `apikey`
- O `sendBeacon` **não permite headers customizados** — então `apikey` e `Authorization` nunca são enviados
- Resultado: a request pode estar sendo **bloqueada pelo gateway do Supabase** antes de chegar na função

Além disso, a imagem mostra apenas 1 registro `tracking_test` (enviado pelo botão Testar da plataforma, que usa `fetch` com headers corretos) — os acessos reais da LP não chegaram.

### Solução (2 arquivos)

**1. Atualizar `public/tracking/tracker.js`**

- Inverter a prioridade: usar `fetch()` como método primário (permite enviar `apikey` no header)
- Manter `sendBeacon` apenas como fallback para `visibilitychange`/`beforeunload`
- Adicionar o header `apikey` (anon key pública) em todas as requests
- Adicionar log de erro em modo debug para facilitar diagnóstico

```
Ordem de envio:
1. fetch() com headers { Content-Type, apikey } + keepalive: true
2. Se fetch falhar → fallback sendBeacon (sem headers, melhor que nada)
```

**2. Atualizar `supabase/functions/track-event/index.ts`**

- Aceitar `Content-Type: text/plain` além de `application/json` (para requests vindos de `sendBeacon`)
- Adicionar log estruturado do payload recebido para debug
- Manter tudo mais igual

### O que NÃO muda
- Nenhuma tabela alterada
- Webhooks e sync_lead_from_sale inalterados
- A Fase 2.5 (bridge clicks → leads) fica para o próximo passo

### Deploy necessário
- Re-deploy da Edge Function `track-event` no Supabase Dashboard
- O `tracker.js` atualiza automaticamente no próximo deploy do Lovable (ou cache clear na LP)

### Resultado esperado
- Cada aba anônima acessando a LP gera 1 registro `pageview` na tabela `clicks`
- UTMs, fbclid, gclid aparecem preenchidos quando presentes na URL
- `fbp` sempre preenchido (gerado pelo tracker)

