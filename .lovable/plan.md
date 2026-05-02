## Diagnóstico

O Kanban da Gabi (RECOMPRA - POTES) não mostra os badges de recontato (verde/vermelho) para vendas **novas** porque elas não estão sendo posicionadas no funil RECOMPRA via webhook.

**Causa raiz:**

1. O webhook do Guru chama `sync_lead_from_sale` (RPC v5).
2. A v5 roteia o lead para **todos os funis** cujo produto bate em:
   - `lead_product_mappings.raw_product_name = product_name` (match exato), OU
   - `lead_funnel_products.product_name_contains` ILIKE no nome do produto.
3. O funil RECOMPRA - POTES (`19f75912-...`) **não tem** uma entrada em `lead_funnel_products` com `product_name_contains = 'articulabem'` apontando pra ele (ou tem mas não está casando).
4. Sem essa entrada, o webhook não posiciona o lead no RECOMPRA, não cria `lead_event` com `funnel_id = recompra` → o hook `useBulkLeadPurchaseProducts` busca eventos filtrando por `funnel_id = recompra` e não encontra → `useRecontactDeadlines` não calcula → badge não aparece.

Foi por isso que o reprocessamento manual (`docs/sql/step2-reprocess-leads-to-recompra.sql`) funcionou — ele pega eventos da BASE e replica no RECOMPRA. Mas vendas novas não passam por esse script.

**Bonus bug menor:** o Guru webhook passa `p_funnel_id` na chamada da RPC, mas a v5 não tem esse parâmetro (foi removido). Argumento é ignorado. Não quebra nada hoje, mas é lixo.

## Solução

### 1. Cadastrar produto Articulabem no funil RECOMPRA - POTES

Inserir (ou garantir que exista) registro em `lead_funnel_products`:

- `lead_funnel_id` = `19f75912-295e-4c67-acad-275ce6849c5c` (RECOMPRA - POTES)
- `product_name_contains` = `articulabem`
- `display_name` = `Articulabem`
- `recontact_days` = valor que a Gabi usa hoje (ex: 90, 120, 180 — preciso confirmar com você)
- `auto_move_stage_id` = etapa "Hora de recontatar" do funil RECOMPRA (preciso confirmar qual)

Com isso:
- Toda venda nova de Articulabem cai automaticamente no RECOMPRA - POTES via `sync_lead_from_sale`.
- O cron `recontact-cron` move o lead pra etapa de recontato quando vencer.
- O Kanban mostra o badge verde (faltam X dias) / vermelho (vencido há X dias).

### 2. Backfill leve (opcional mas recomendado)

Rodar o script `docs/sql/step2-reprocess-leads-to-recompra.sql` mais uma vez para pegar qualquer venda dos últimos dias que entrou DEPOIS do nosso último backfill mas ANTES desse cadastro de produto.

### 3. Limpeza do webhook Guru

Remover o `p_funnel_id: funnelId` da chamada `sync_lead_from_sale` no `supabase/functions/guru-webhook/index.ts` (linha 370). Argumento ignorado, gera ruído. Função principal — gravar a venda em `sales` com `funnel_id` — continua intacta.

## Perguntas antes de executar

Preciso confirmar com você dois valores:
- **Quantos dias** de recontato pra Articulabem? (90? 120? 180?)
- **Qual etapa** do RECOMPRA - POTES o lead deve ir quando vencer? (nome da coluna no Kanban da Gabi: "Hora de recontatar"? "Recompra agora"?)

Se você não souber de cabeça, eu rodo um SELECT no funil RECOMPRA pra te listar as etapas e algum produto já configurado lá pra você comparar, e você me responde.

## Detalhes técnicos

**Arquivos envolvidos:**
- `supabase/functions/guru-webhook/index.ts` (limpar `p_funnel_id`)
- `lead_funnel_products` (insert do Articulabem no RECOMPRA)
- `docs/sql/step2-reprocess-leads-to-recompra.sql` (rerun opcional)

**Tabelas que serão tocadas:**
- INSERT em `lead_funnel_products` (1 linha)
- Edge function redeployada (manual via dashboard, conforme nosso padrão)

**Sem migrations de schema. Sem mudanças em RLS.**
