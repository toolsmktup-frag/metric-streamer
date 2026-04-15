

## Cross-domain visitor stitching via tracker.js v1.3

### O que muda
Duas coisas no `tracker.js`:

1. **Aceitar `ms_vid` na URL** — se a página de destino receber `?ms_vid=ABC`, usa esse ID em vez de criar um novo. Isso conecta os pageviews entre domínios.

2. **Auto-decorar links externos** — após o DOM carregar, o script percorre todos os `<a href>` que apontem pra domínios diferentes e appenda `?ms_vid={visitor_id}` automaticamente. Você não precisa mexer em nada nos seus botões.

### Fluxo prático

```text
LP captura (seu domínio)              join-now-vip.lovable.app
────────────────────────              ──────────────────────────
visitor_id = ABC                      ?ms_vid=ABC → visitor_id = ABC
pageview (stage 1)                    pageview (stage 2)
email_capture (email=fulano@x)        → mesmo visitor_id = ABC
                                      → você sabe quem é
```

### Recomendação
**Auto-decoração é melhor** — zero trabalho manual, funciona com qualquer botão/link que você colocar na página. Se depois trocar a URL de redirect, continua funcionando sem mexer em nada.

### Mudanças técnicas

**`public/tracking/tracker.js`** (v1.2 → v1.3):
- `getOrCreateVisitorId()`: checar `getParam("ms_vid")` antes de gerar UUID novo
- Nova função `decorateOutboundLinks()`: percorre `<a>` tags, filtra links de domínio diferente, appenda `ms_vid`
- Chamar após DOMContentLoaded + no MutationObserver (pega links dinâmicos)
- Atualizar versão no `TRACKER_SRC` do `TrackingSnippetPopover.tsx`

