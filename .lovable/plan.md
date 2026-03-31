
Status atual

- Ainda não dá para dizer que o fluxo está pronto para novos eventos com segurança.
- O código atual do `supabase/functions/ticto-webhook/index.ts` já está preparado para gravar `raw_payload`, `ingestion_type: 'webhook'`, `source_platform: 'ticto'` e `funnel_id`.
- Porém, o print do banco mostra `54211` registros no funil Guia e `0` com payload. Então, hoje, não existe evidência de nenhum webhook novo persistido nesse funil.
- Além disso, a captura de rede do dashboard mostrou uma chamada a `v_all_sales` sem `ingestion_type=eq.webhook`, embora o código do repo (`src/pages/FunilResumo.tsx` + `src/hooks/useAllSales.ts`) devesse aplicar esse filtro.

Por que está dando ruim

- O histórico importado não tem `raw_payload`; isso não pode ser reconstruído “de dentro” do sistema.
- Falta observabilidade: se o `ticto-webhook` falha antes de salvar, ele não deixa trilha útil para diagnóstico.
- Há divergência entre repo e runtime/schema:
  - o repo mostra um `v_all_sales` antigo nas migrations
  - o runtime real já responde com colunas extras
  - o request capturado não bate 100% com o filtro presente no código
- Resultado: hoje não dá para afirmar se o problema é:
  1. Ticto não postando no endpoint real
  2. Edge Function falhando antes do save
  3. schema/view do banco divergente
  4. frontend/runtime ainda lendo sem o filtro esperado

Plano de correção

1. Instrumentar o `ticto-webhook`
- Criar uma tabela de auditoria de recebimento de webhook.
- Salvar para toda chamada:
  - `received_at`
  - token recebido
  - chaves principais do payload
  - `order_id`, `product_id`
  - status bruto e normalizado
  - `funnel_id` resolvido
  - mensagem de erro
  - `raw_payload`
- Fazer esse registro antes do insert/update principal.
- Blindar parsing de datas para não quebrar o request em `toISOString()`.

2. Alinhar banco e código
- Criar migration canônica garantindo que `ticto_transactions` tenha explicitamente os campos usados pelo app atual, em especial `ingestion_type` e `source_platform`.
- Recriar/atualizar a view `v_all_sales` incluindo `ingestion_type` de forma explícita.
- Atualizar os tipos gerados do Supabase para refletir o schema real e reduzir uso de `as any`.

3. Alinhar o dashboard
- Confirmar que `FunilResumo` publicado realmente consulta com `ingestion_type='webhook'`.
- Se necessário, adicionar um indicador temporário no resumo mostrando contagem de `webhook` vs `import` para diagnóstico visual rápido.

4. Validar ponta a ponta com 1 evento novo real
- Esperado após o próximo webhook:
  - 1 linha na auditoria
  - 1 insert/update em `ticto_transactions`
  - `raw_payload` não nulo
  - `funnel_id = 10000000-0000-0000-0000-000000000001`
  - `ingestion_type = 'webhook'`
- Depois disso, a venda deve aparecer no Resumo do funil.
- Se aparecer no banco e não no dashboard, o problema fica isolado em query/view/cache.
- Se nem a auditoria registrar, o problema é externo ao app ou no deploy real da função.

5. Regra para retroativo
- Os 54k importados devem continuar como `import`.
- Só devem aparecer como `webhook`:
  - eventos novos que entrarem agora
  - ou reenvios oficiais que realmente passem pela função

Detalhes técnicos

- Arquivos principais:
  - `supabase/functions/ticto-webhook/index.ts`
  - `src/hooks/useAllSales.ts`
  - `src/pages/FunilResumo.tsx`
  - migration nova para auditoria
  - migration nova/atualizada para `v_all_sales`
- Evidências objetivas encontradas:
  - o repo já filtra `webhook` no resumo do funil
  - o runtime capturado não mostrou esse filtro na request
  - o repo não representa fielmente a view/schema que o runtime está consumindo
  - o banco do Guia segue sem `raw_payload`

Resultado esperado

- O próximo evento Ticto deixa de “sumir”.
- O funil de tráfego passa a mostrar somente vendas recebidas por webhook real.
- O histórico importado continua útil no contexto de leads/resumo geral, sem contaminar o funil de tráfego.
- Se continuar sem entrar nada, o diagnóstico final fica objetivo e comprovável: URL publicada/Ticto/deploy real da Edge Function, e não mais “talvez o dashboard”.
