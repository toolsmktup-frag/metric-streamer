

## Diagnóstico e Correção: UTMs não sendo capturados na LP

### Problema
Os pageviews da LP chegam na tabela `clicks` mas com TODOS os campos de UTM, fbclid e gclid como NULL — mesmo quando presentes na URL. O `tracker.js` v1.2 neste projeto extrai corretamente, mas a LP pode estar servindo uma versão cacheada ou diferente.

### Ações

**1. Forçar cache-bust no tracker.js**
- Renomear ou adicionar versão no path: `public/tracking/tracker.js` → servir com query string de versão
- Atualizar o `TrackingSnippetPopover` para gerar snippet com `?v=1.2` no src do script

**2. Verificar se a LP está carregando o script correto**
- Acessar a LP e verificar no DevTools (Network tab) se o `tracker.js` que carrega é o v1.2
- Se for versão antiga, o problema é cache do CDN/browser

**3. Instruções para o outro chat Lovable**
- Gerar o texto exato para o usuário enviar ao outro chat pedindo para limpar cache e verificar a versão do script

### Mudanças no código (este projeto)

| Arquivo | Mudança |
|---------|---------|
| `src/components/lead-funnels/TrackingSnippetPopover.tsx` | Adicionar `?v=1.2` ao TRACKER_SRC para bust de cache |

### Verificação imediata
Após o deploy, pedir ao usuário para acessar a LP em aba anônima novamente e conferir se os UTMs aparecem preenchidos na tabela `clicks`.

