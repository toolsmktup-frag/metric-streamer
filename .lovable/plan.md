

## Trocar Copiloto para Claude Haiku 4.5

### Decisão
Usar **Anthropic direto** (não Lovable AI Gateway, não OpenRouter), com o modelo `claude-haiku-4-5` via API oficial da Anthropic.

### O que muda na edge function `sales-copilot`

1. Trocar endpoint:
   - de: `https://ai.gateway.lovable.dev/v1/chat/completions`
   - para: `https://api.anthropic.com/v1/messages`
2. Trocar autenticação:
   - de: `Authorization: Bearer ${LOVABLE_API_KEY}`
   - para: `x-api-key: ${ANTHROPIC_API_KEY}` + `anthropic-version: 2023-06-01`
3. Trocar formato do payload:
   - Anthropic usa `system` separado do array `messages` (não vai como role)
   - Streaming usa SSE com eventos `content_block_delta` (estrutura diferente do OpenAI)
4. Trocar parser de SSE no frontend (`useSalesCopilot.ts`):
   - hoje lê `parsed.choices[0].delta.content` (formato OpenAI)
   - precisa ler `parsed.delta.text` quando `event: content_block_delta` (formato Anthropic)
5. Modelo: `claude-haiku-4-5` em todas as 4 ações (sugerir, analisar, objeção, perguntar)

### Setup que você precisa fazer

1. Pegar sua API key em https://console.anthropic.com/settings/keys (formato `sk-ant-...`)
2. Adicionar no Supabase como secret de Edge Function:
   - Painel Supabase → Project Settings → **Edge Functions → Secrets**
   - Name: `ANTHROPIC_API_KEY`
   - Value: `sk-ant-...`
3. Como seu projeto Supabase não está vinculado ao Lovable Cloud, eu te entrego os 2 arquivos prontos pra você colar manual:
   - `supabase/functions/sales-copilot/index.ts` → cola no editor da função no painel Supabase e clica **Deploy**
   - `src/hooks/useSalesCopilot.ts` → já fica atualizado aqui no Lovable, deploy automático no frontend

### Custo estimado (Haiku 4.5)
- Input: ~$1/M tokens
- Output: ~$5/M tokens
- Cada ação do Copiloto gasta ~2-5k tokens → fração de centavo por uso

### Trade-offs
- Haiku 4.5 é o mais rápido e barato da família Claude 4, ótimo pra resposta de copiloto em tempo real
- Se quiser análise mais profunda em "Analisar conversa", podemos usar `claude-sonnet-4-5` só nessa ação (te aviso e você decide)
- A `LOVABLE_API_KEY` deixa de ser necessária — não precisa habilitar Lovable Cloud só pra isso

### Detalhes técnicos
- Manter streaming SSE end-to-end (Anthropic suporta nativo)
- Manter os `try/catch` granulares por etapa de contexto (mensagens, lead, stage, LTV, script)
- Manter cancelamento via `AbortController`
- Headers CORS preservados
- Sem mudança de schema no banco

### Confirmação necessária
Me responde só **"vai"** que eu já gero os 2 arquivos prontos pra você colar no Supabase + atualizo o frontend aqui.

