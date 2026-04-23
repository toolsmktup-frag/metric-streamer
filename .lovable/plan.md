# Enriquecer contexto do lead no Copiloto de Vendas

## O que vai mudar

Atualizar a edge function `sales-copilot` pra puxar MUITO mais contexto do lead antes de mandar pro Claude. Hoje ela só pega: nome, email, tags, funil/etapa, LTV e 5 últimas compras. Vai passar a pegar também:

1. **Eventos do lead** (últimos 20 de `lead_events`) — PIX gerado, carrinho abandonado, mudanças de etapa, cliques, etc.
2. **Tempo parado na etapa atual** (calculado via `entered_at` de `lead_stage_positions`) — "lead há 7 dias parado em 'Aguardando pagamento'"
3. **UTMs de origem** (utm_source, utm_campaign, utm_content) — pra Claude saber se veio de anúncio FB, indicação, orgânico
4. **Endereço** (cidade/estado extraídos de `metadata` do lead) — útil pra rapport
5. **Histórico financeiro expandido** — de 5 pra 15 últimas compras + resumo: ticket médio, dias desde a última compra, método de pagamento favorito, produto mais comprado
6. **Status do cliente** — primeira compra, recorrente, inativo (sem comprar há 90+ dias), etc.

## Como o Claude vai usar isso

O `buildSystemPrompt` vai ganhar instruções extras tipo:
- Se LTV > R$ 1.000 → tratar como cliente VIP, tom mais próximo
- Se parado >5 dias na etapa → sugerir mensagem de reativação/quebra de gelo
- Se tem PIX gerado mas não pagou → focar em remover fricção do pagamento
- Se cidade conhecida → pode usar referência local sutil
- Se veio de UTM específica → adaptar abordagem (lead de FB Ads ≠ indicação)

## O que você precisa fazer

Vou te entregar **1 arquivo único** (`supabase/functions/sales-copilot/index.ts`) pra você:
1. Abrir o Supabase Dashboard → Edge Functions → `sales-copilot`
2. Apagar o conteúdo atual
3. Colar o novo
4. Deploy

Não precisa migration nem mudança no banco — todas as tabelas usadas (`lead_events`, `lead_stage_positions`, `unified_customers`, `customer_purchases`) já existem.

## Detalhes técnicos

- Todas as queries novas rodam em `Promise.allSettled` em paralelo pra não aumentar latência
- Cada query tem try/catch isolado — se uma falhar (ex: lead sem eventos), o resto continua
- O `leadCtx` (string passada no system prompt) vai de ~300 chars pra ~1500 chars no caso de lead rico, ainda bem dentro do limite de contexto da Claude Haiku 4.5
- Mantém compatibilidade total com o frontend (`useSalesCopilot.ts`) — nenhuma mudança no contrato da request/response
- Mantém o stream SSE no formato OpenAI-like que o hook já espera

Confirma que posso seguir e gerar o arquivo?