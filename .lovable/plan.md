

## Verificação real do snippet na página do usuário

### O problema
Hoje o botão "Verificar eventos" só consulta o banco pra ver se já tem cliques. Não verifica se o snippet **está instalado** na página. Você quer que ele acesse a página e confirme que o código está lá.

### A solução
Criar uma Edge Function `verify-tracking-snippet` que:
1. Recebe a URL da página (ex: `workshopervas.matheuscolombo.com.br`)
2. Faz um `fetch` do HTML da página no server-side
3. Analisa o HTML procurando pelo `tracker.js` com o `stage_id` correto
4. Retorna um diagnóstico detalhado

### O que a função vai checar

| Verificação | Resultado |
|---|---|
| Snippet `tracker.js` encontrado no HTML | ✅ / ❌ |
| `data-endpoint` aponta pro endpoint correto | ✅ / ❌ |
| `data-stage-id` bate com o stage atual | ✅ / ❌ |
| `data-funnel-id` bate com o funil atual | ✅ / ❌ |
| Snippet está no `<head>` (não no body) | ✅ / ⚠️ |

### Mudanças

**1. Nova Edge Function: `supabase/functions/verify-tracking-snippet/index.ts`**
- Recebe `{ url, funnel_id, stage_id }` via POST
- Faz fetch do HTML da URL
- Usa regex pra encontrar as tags `<script>` com `tracker.js`
- Valida os atributos `data-endpoint`, `data-funnel-id`, `data-stage-id`
- Retorna objeto com cada check (found, endpoint_ok, funnel_ok, stage_ok, in_head)

**2. Atualizar `TrackingSnippetPopover.tsx`**
- Adicionar botão "Verificar instalação" (separado do "Verificar eventos")
- Ao clicar, chama a edge function passando a `pageUrl` da etapa
- Mostra resultado detalhado: checklist visual com cada item
- Se `pageUrl` não estiver configurada, mostra aviso pedindo pra preencher

### Detalhes técnicos
- A Edge Function precisa `verify_jwt = false` no config.toml (ou usar apikey)
- Timeout de 10s no fetch da página externa
- Se a página retornar erro (404, timeout), reporta como "página inacessível"
- O botão só aparece se a etapa tiver `pageUrl` preenchida

