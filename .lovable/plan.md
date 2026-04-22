

## Copiloto de Vendas no Chat (IA auxiliar do vendedor)

Painel lateral no chat WhatsApp que lê o histórico da conversa + contexto do lead (funil, etapa, produtos, LTV) e gera **sugestões pro vendedor** — nunca responde o cliente direto. Vendedor sempre revisa e envia.

### O que o vendedor vê

Botão **"✨ Copiloto"** no header do `ChatThread`. Abre drawer lateral (380px) com 4 ações:

1. **Sugerir resposta** — 2-3 variações alinhadas ao script de vendas
2. **Analisar conversa** — temperatura do lead (frio/morno/quente), objeções detectadas, próximo passo
3. **Responder objeção** — vendedor cola a objeção, IA devolve contornos baseados no script
4. **Pergunta livre** — "o cliente perguntou sobre parcelamento, o que respondo?"

Cada sugestão tem **"Copiar"** e **"Usar no input"** (pré-preenche o `ChatInput` pra editar antes de mandar).

### Contexto enviado pra IA

- Últimas 30 mensagens da conversa atual (papel cliente/vendedor + texto + timestamp)
- Lead: nome, telefone, etapa atual, funil, tags
- LTV e histórico de compras (via `unified_customers`)
- Script de vendas ativo da organização

### Script de vendas configurável

Nova página `/configuracoes/copiloto-vendas` com editor markdown grande pra cada org definir:
- Tom de voz
- Etapas do script (abertura → sondagem → oferta → fechamento)
- Objeções comuns + respostas modelo
- Produtos, valores, condições
- O que NÃO falar

Tabela `sales_copilot_scripts` (id, organization_id, name, content, is_default, timestamps) com RLS por org. Apenas admin/gestor edita; vendedor consome.

### Backend

Edge function `supabase/functions/sales-copilot/index.ts`:
- Recebe `{ action, phone, instance_id, custom_question? }`
- Busca histórico (`whatsapp_messages` + joins de lead/LTV)
- Carrega script ativo da org
- Chama Lovable AI Gateway:
  - `google/gemini-3-flash-preview` (default — rápido e barato pra sugestões)
  - `google/gemini-2.5-pro` na ação "Analisar conversa" (mais profunda)
- **Streaming SSE** pra renderizar token a token
- Trata 429 (rate limit) e 402 (créditos) com toast claro

### Arquivos

**Novos:**
- `supabase/functions/sales-copilot/index.ts`
- `src/components/whatsapp/SalesCopilotPanel.tsx` (drawer com 4 abas)
- `src/components/whatsapp/SalesCopilotButton.tsx`
- `src/hooks/useSalesCopilot.ts` (streaming via fetch + SSE)
- `src/hooks/useSalesScripts.ts` (CRUD do script)
- `src/pages/SalesCopilotConfig.tsx` (editor markdown)
- Migration: `sales_copilot_scripts` + RLS por org

**Editar:**
- `src/components/whatsapp/ChatThread.tsx` — adicionar botão Copiloto
- `src/pages/WhatsAppChat.tsx` — montar drawer + callback `onUseInInput`
- `src/components/whatsapp/ChatInput.tsx` — aceitar `prefillText`
- `src/App.tsx` — rota `/configuracoes/copiloto-vendas`
- Sidebar — link de configuração (admin only)

### Permissões

- Vendedor usa o copiloto no chat (sem custos visíveis pra ele)
- Admin/gestor edita o script
- RLS: `sales_copilot_scripts` filtra por `organization_id` do usuário

### Custos

- Lovable AI já provisionado (sem API key extra)
- Default Flash é barato; Pro só na análise profunda
- Stateless: cada chamada monta contexto do zero (sem histórico de conversa com IA)

### Fora de escopo (v1)

- Auto-resposta sem confirmação do vendedor
- Análise em batch de várias conversas
- Treinar modelo customizado
- Métricas de uso do copiloto (fica pra v2)

