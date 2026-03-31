
Objetivo
- Fazer o Guia de Tinturas voltar a funcionar de ponta a ponta sem regredir o Articulabem: Meta -> Ticto -> funil -> automação WhatsApp.

Diagnóstico atual
- O resumo do funil em si não parece quebrado: `src/pages/FunilResumo.tsx`, `src/hooks/useMetaData.ts` e `src/hooks/useAllSales.ts` já filtram por `funnel_id`.
- A captura atual do Guia já mostra spend/impressões, então o problema não é “o funil inteiro parou”; o gap está no lado de vendas/automação do Guia.
- O ponto mais fraco hoje é o pipeline específico do Ticto/Guia:
  1. `wz-receiver` ainda não está tão resiliente quanto `ticto-webhook` para payload Ticto v2, especialmente telefone aninhado em `customer.phone.ddi/ddd/number` e variações de produto/status.
  2. O dashboard depende de `ticto_transactions.funnel_id`; se eventos antigos do Guia entraram com `funnel_id` nulo/errado ou com `product_name/paid_amount` incompletos, o funil mostra gasto mas não mostra venda.
  3. As keywords do Guia no seed estão simples demais (`TINTURA`, `CHÁ`, `MESTRE`) e não cobrem bem o cenário atual. Isso enfraquece `resolve_funnel_id` e `auto_assign_campaign_funnels`.
  4. Há um gap estrutural no Meta: a UI aceita múltiplos `meta_account_id` separados por vírgula, mas a lógica SQL antiga de auto-tag por conta compara igualdade exata. Isso pode deixar campanhas do Guia sem `funnel_id` quando há mais de uma conta.

Por que o Articulabem “funciona” e o Guia não
- O Articulabem depende menos de payload Ticto ambíguo e costuma ter naming mais explícito para campanha/produto.
- O Guia é mais sensível a:
  - variações de nome do produto
  - payload Ticto v2
  - match por keyword
  - backfill de eventos antigos que ficaram salvos com dados incompletos

Plano de implementação
1. Equalizar a normalização Ticto no `wz-receiver`
   - Tornar `normalizeTicto` tão robusto quanto o `ticto-webhook`.
   - Suportar explicitamente:
     - `data.invoice`
     - `invoice.customer` / `invoice.buyer`
     - `customer.phone.ddi`, `customer.phone.ddd`, `customer.phone.number`
     - `invoice.product`, `invoice.product_id`, `invoice.items[0]`
     - `invoice.status`
   - Preservar compatibilidade com payload legado/top-level.
   - Melhorar logs de “NO MATCH” com `status`, `product_id`, `product_name` e `phone` já normalizados.

2. Reforçar o roteamento do Guia de Tinturas
   - Criar nova migration para atualizar `funnel_products` do Guia com keywords mais específicas:
     - `TINTURA`
     - `PREPARO`
     - `CHÁ`
     - `CHA`
     - `MESTRE DAS TINTURAS`
   - Reforçar `resolve_funnel_id(...)` indiretamente via essas keywords.
   - Reexecutar `auto_assign_campaign_funnels()` depois da correção.

3. Corrigir o isolamento Meta para múltiplas contas
   - Criar nova migration ajustando `auto_tag_meta_campaign_funnel()` / `tag_meta_campaigns_funnel()` para aceitar `meta_account_id` com múltiplos valores separados por vírgula, seguindo a própria UI de `FunisConfigurar`.
   - Regra esperada:
```text
funnel.meta_account_id = "123,456"
NEW.account_id = "456"
=> deve casar e preencher funnel_id
```
   - Isso reduz o risco de o Guia ficar com campanhas sincronizadas mas não atribuídas ao funil.

4. Backfill dos dados antigos do Guia
   - Criar migration SQL para corrigir em `ticto_transactions` do Guia:
     - `paid_amount`
     - `product_name`
     - `status`
     - `order_id`
     - `funnel_id` quando estiver nulo
   - A fonte do backfill será `raw_payload`, reaproveitando o padrão já documentado em `docs/backfill-guia-tinturas.sql`.
   - Depois disso, o `v_all_sales` volta a alimentar o dashboard do Guia com o histórico corrigido.

5. Blindagem operacional das Edge Functions
   - Adicionar validação explícita de segredos/variáveis antes de usar Supabase ou APIs externas, com o padrão:
```ts
const supabaseUrl = Deno.env.get("SUPABASE_URL");
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
if (!supabaseUrl || !serviceRoleKey) {
  return new Response(JSON.stringify({ error: "Server configuration error" }), { status: 500 });
}
```
   - Aplicar isso em `wz-receiver`, `wz-executor` e, se necessário, `ticto-webhook`/`sync-meta`.
   - Manter o fluxo assíncrono por webhook/fire-and-forget; não introduzir polling síncrono nas Edge Functions.

Arquivos/áreas a mudar
- `supabase/functions/wz-receiver/index.ts`
- `supabase/functions/wz-executor/index.ts` (apenas logs/robustez, sem mudar a regra boa atual)
- nova migration para:
  - corrigir keywords do Guia em `funnel_products`
  - suportar múltiplos `meta_account_id` no tagueamento Meta
  - backfill de `ticto_transactions` do Guia

Validação final
```text
Ticto webhook
  -> ticto_transactions salva product_id/product_name/status/funnel_id corretamente
  -> wz-receiver normaliza o mesmo payload corretamente
  -> flow com productIdFilter faz match
  -> wz_executions é criado
  -> wz-executor envia para a UAZAPI
  -> /funis/10000000-0000-0000-0000-000000000001/resumo mostra a venda no período correto
```
- Validar com 1 evento real de Pix gerado do Guia.
- Reprocessar eventos antigos após deploy.
- Conferir o dashboard no mesmo intervalo do evento reprocessado, não só em “Hoje”, para evitar falso negativo visual.

Resultado esperado
- Articulabem continua estável.
- Guia de Tinturas passa a:
  - casar melhor campanhas Meta
  - receber `funnel_id` corretamente nas vendas Ticto
  - criar execuções de automação por `productIdFilter`
  - exibir vendas quando houver transação autorizada
