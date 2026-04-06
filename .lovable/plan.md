
Objetivo: corrigir o pipeline do Guia de Tinturas porque o print mostra eventos `abandoned_cart` com `paid_amount = 0`, `product_name` vazio e `order_date = NULL`, o que não faz sentido como base principal de vendas.

O que isso indica
- Não, não faz sentido tratar isso como “o normal” do funil.
- O token/funil parece estar funcionando, porque essas linhas já chegam com o `funnel_id` correto do Guia.
- O print também pode estar enganando parcialmente: como a consulta usa `ORDER BY order_date DESC`, linhas com `order_date NULL` tendem a aparecer primeiro, então esses 10 registros não provam sozinhos que não existam compras aprovadas mais abaixo.
- Mesmo assim, existe um problema real no código: o `ticto-webhook` está mais fraco que os outros pipelines e o dashboard só conta `status = 'authorized'`.

Plano
1. Auditar os eventos reais que estão chegando
   - Usar `webhook_audit` para ver quais `raw_status` a Ticto está enviando para o token do Guia.
   - Separar eventos de abandono dos eventos de compra/pagamento.
   - Se a auditoria mostrar que só chega `abandoned_cart`, então além do código haverá ajuste operacional na configuração da Ticto.

2. Corrigir a normalização do `ticto-webhook`
   - Atualizar `supabase/functions/ticto-webhook/index.ts`.
   - Incluir os mesmos status que já são aceitos em outros pontos do projeto:
     - `sale_approved`, `sale_completed`, `completed`, `purchase_approved` -> `authorized`
   - Manter `abandoned` / `cart_abandoned` como não-venda.
   - Reforçar a extração de `order_date`, `paid_amount` e `product_name` com base nos payloads reais da auditoria.

3. Fazer backfill dos registros já gravados
   - Criar um SQL idempotente para corrigir registros antigos do Guia de Tinturas.
   - Preencher `status`, `paid_amount`, `product_name` e `order_date` a partir do `raw_payload` quando houver dados reais de compra.
   - Não converter abandono real em venda.

4. Validar o contrato com o dashboard
   - Confirmar que `v_all_sales` continua entregando compras com `purchased_at` válido.
   - Confirmar que `FunilResumo` e `useAllSalesAggregation` seguem contando apenas `authorized`.
   - Se o problema for só status não normalizado, não precisaremos mexer no frontend.

5. Teste ponta a ponta
   - Validar com 1 evento de abandono e 1 evento de compra aprovada.
   - Resultado esperado:
     - abandono continua como `abandoned_cart`
     - compra aprovada entra como `authorized`
     - `order_date` / `purchased_at` ficam preenchidos
     - a venda aparece em `v_all_sales`
     - o resumo do funil sai do zero
     - CRM e automações só disparam para compra aprovada

Detalhes técnicos
- Arquivos principais:
  - `supabase/functions/ticto-webhook/index.ts`
  - `src/hooks/useAllSales.ts`
  - `src/pages/FunilResumo.tsx`
  - `docs/backfill-guia-tinturas.sql`
  - `docs/stabilize-webhook-pipeline.sql`
- Evidência importante:
  - `FunilResumo` só contabiliza `status === 'authorized'`.
  - O `ticto-webhook` atual não mapeia `sale_approved` / `sale_completed`, enquanto `import-ticto-csv` e `guru-webhook` já mapeiam.

Conclusão prática
- Sim, há um problema do nosso lado para normalização e backfill.
- E pode haver um segundo problema na Ticto, se a auditoria confirmar que eventos aprovados nem estão chegando ao endpoint.
