
Diagnóstico: o reprocessamento rodou, mas o print mostra `0 rows` em `wz_executions`, então o problema está antes do envio da mensagem: os eventos não estão criando execução. Pela revisão do código, o gargalo principal é que o `wz-receiver` ainda está normalizando Ticto no formato antigo, enquanto o `ticto-webhook` já trata Ticto v2 (`data.invoice`, `invoice.customer`, `invoice.product`). Assim, os eventos reprocessados chegam ao `wz-receiver` sem `status`, `product_id` e telefone confiáveis, e falham no `matchesTrigger`.

Plano de correção:
1. Corrigir `supabase/functions/wz-receiver/index.ts`
   - Atualizar `normalizeTicto` para suportar payload Ticto v2:
     - `data.invoice`, `invoice.customer`/`invoice.buyer`
     - `invoice.product` / `invoice.items[0]`
     - `invoice.status`
     - telefone com DDI + DDD + número, igual ao `ticto-webhook`
   - Manter compatibilidade com payload antigo/top-level.
   - Incluir no `raw_payload` o payload original sem perder estrutura.

2. Alinhar o match dos gatilhos
   - Garantir que `normalizeStatus` continue convertendo:
     - `waiting_payment`, `pending`, `pix_created` → `pix_generated`
     - `approved`, `paid` → `purchase_approved`
   - Preservar o filtro exato por `productIdFilter`, mas validar que o `product_id` venha sempre como string consistente.

3. Corrigir envio para UAZAPI no executor
   - O `wz-executor` está usando endpoints `/message/sendText` e `/message/sendImage`, mas a spec do projeto aponta `/send/text` e `/send/media`.
   - Ajustar payload e endpoint para o padrão documentado, senão mesmo com execução criada o disparo pode falhar silenciosamente.

4. Melhorar observabilidade
   - Adicionar logs objetivos no `wz-receiver`:
     - status normalizado
     - product_id
     - telefone
     - motivo de não-match por fluxo
   - Adicionar log de resposta HTTP da UAZAPI no `wz-executor` quando o envio falhar.

5. Validar ponta a ponta após deploy
   - Reprocessar novamente os eventos dos últimos 3 dias.
   - Confirmar nesta ordem:
     - `wz_executions` recebe registros
     - `trigger_event` fica como `pix_generated` ou esperado
     - `contact_phone` e `variables.product_id` vêm preenchidos
     - execuções avançam para `completed` ou `waiting`
     - UAZAPI responde com sucesso no envio

Checks rápidos que explicam o que aconteceu agora:
- O SQL de reprocessamento funcionou.
- Mas `wz_executions` ficou vazio porque o `wz-receiver` ainda não reconhece bem o payload Ticto que está salvo em `raw_payload`.
- Mesmo depois disso, ainda existe um segundo gap no `wz-executor` com endpoints da UAZAPI divergentes da documentação.

Arquivos a ajustar:
- `supabase/functions/wz-receiver/index.ts`
- `supabase/functions/wz-executor/index.ts`

Resultado esperado:
- Eventos Ticto reprocessados passam a criar execuções.
- Gatilhos por ID de produto passam a bater corretamente.
- O disparo deixa de “sumir” entre webhook recebido e execução vazia.
- O envio para WhatsApp fica compatível com a API documentada do UAZAPI.
