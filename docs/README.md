# Documentação — metric-streamer ("Tráfego Lovable")

App interno de CRM de funis (Meta Ads, webhooks de venda Ticto/Guru/Eduzz, WhatsApp,
recompra de encapsulados). Stack: Vite + React + TS + Supabase. Uso interno (1 org).

> Supabase ref: `emfbocpmphtftqcezaib` · Repo: `Matheuscolombo/metric-streamer` (deploy via Lovable).

## Índice

### Auditorias & correções aplicadas
- **[Auditoria de Segurança (2026-06-10)](./AUDITORIA-SEGURANCA-2026-06-10.md)** — blindagem de ~13 edge functions expostas, RLS de tabelas órfãs, HIBP. Inclui pendências e checklist pré-deploy. _(PR #1, mergeado)_
- **[Correção Recompra/Recontato (2026-06-11)](./RECOMPRA-CORRECAO-2026-06-11.md)** — cálculo de recompra por quantidade de potes (fim do `-979d`), soma de compras, ingestão grava quantidade. _(PR #2)_
- **[Eco de expiração Guru + Permissão "Funil avançado" (2026-06-12)](./FIX-ECO-EXPIRACAO-2026-06-12.md)** — boleto/PIX expirado dias depois re-datava leads em "Recuperar" como se fossem tentativas de hoje; RPC v8 com gate de frescor 48h + `original_date` (aplicada em prod). Dedup da timeline. Permissão individual para liberar as abas extras do funil por vendedor + trava no "Limpar Funil". _(PRs #6 e #7, mergeados)_
- **[Order bump, Resumo×KPI e vínculo de campanhas (2026-06-30)](./FIX-FUNIL-DASHBOARD-2026-06-30.md)** — order bump Ticto vinha embutido no `order.paid_amount` do principal (webhook passou a desmembrar + backfill junho); resumo de funil divergia da KPI porque atribuição herdada puxava produtos de outro funil (`belongsToFunnel` agora usa `mapped_funnel_id`); investimento R$0 na KPI do Articulabem = 33 campanhas presas num funil inativo, re-vinculadas. _(PRs #41 e #42, mergeados)_
- **[WhatsApp CRM, encoding de webhooks, matching de compras e datação de vendas (2026-07-01)](./FIX-2026-07-01.md)** — barra "Atendido pela IA" só na instância do Girassol; dedup de conversa por 9º dígito (+ regressão de envio "mensagens sumindo" corrigida — identificador voltou a ser o número real); nome do lead como fallback na lista; acento `�` nos webhooks (latin-1 lido como UTF-8) + `readJsonBody`; matching de compras por 9º dígito (receita/recontato); order bump Guia de Tinturas (o split do #41 nunca tinha sido deployado — Lovable não deploya edge functions) + backfill; upsell Mestre datado pelo pedido base → passa a contar no dia do pagamento (`status_date`) + backfill 136 vendas. _(PRs #47–#52, mergeados)_
- **[Aba Conjuntos zerada — pipe no nome do adset (2026-07-01, noite)](./FIX-ADSET-UTM-2026-07-01.md)** — conjuntos nomeados com `|` (ex. `05 - Teste 1 - Imagem | 16/6`) quebravam o `parseUtmPair` dos 3 webhooks (exigia 2 partes no split) → `meta_adset_id` NULL → aba Conjuntos com gasto e zero vendas. Helper `_shared/parseUtmPair.ts` (corte pelo último pipe + id numérico obrigatório) + backfill de ~24k linhas de atribuição (adset/ad em Ticto/Guru/Eduzz). Achado paralelo: 191 vendas com UTMs literais `{{campaign.name}}` = link com template cru circulando fora do Meta (pendência do Matheus). _(PR #54, mergeado + deployado)_
- **[Auditoria campanhas Meta + CRM recompra + crons (2026-07-03 → 06)](./FIX-2026-07-03-06.md)** — trigger de auto-vínculo re-carimbava as campanhas p/ funil inativo a cada sync (KPI Articulabem zerada, correções manuais desfeitas); 347 compradores fora do funil de recompra + 214 leads invisíveis com vendedora bloqueada + compra não distribuía (trigger `trg_auto_distribute_on_entry`); cron do sync Meta **nunca** tinha funcionado (GUCs jamais setadas + getUser barrava service key → token dedicado `SYNC_META_CRON_SECRET`); `wz-scheduler-cron` fantasma (placeholders, OOM por minuto) desagendado + fila de 655 steps expirada; sessão de usuária bloqueada seguia dando auto-claim em leads (ban no GoTrue + guardas nas RPCs); parser "pote sem número" + tooltip explicando o timer. _(PRs #56–#59, mergeados + deployados)_
- **[Rastreios (auditoria/catálogo/número dedicado) + instâncias WhatsApp em dobro (2026-07-09)](./FIX-2026-07-09.md)** — fila de rastreio auditada e saneada (código typo, código repartido em 2 clientes, dedupe telefone+código no motor); ~478 vendas físicas pagas invisíveis na tela (classificadas 'digital') → catálogo configurável `shipping_products` + backfill corte 10/06; disparo pinado no número dedicado 48 99211-2108, marca Soulnaturi, botão "Enviar", auditoria de quem inseriu; espelho automático `whatsapp_instances → wz_instances` (dropdown das automações de grupo) + fix do "Sem número" (`instance.owner` da UazAPI). _(PRs #67–#72, mergeados; migrations aplicadas; disparo segue desligado)_
- **[Carrinho abandonado ponta a ponta — Ticto + Guru + auditoria da entrega (2026-07-22)](./FIX-2026-07-22.md)** — 5 bugs encadeados: trigger com filtro `[]` truthy nunca casava (Guia 60 dias sem execução); envio 0/erro logava `success` (falha silenciosa da instância caída); Guru descartava abandono antes do card ("unknown status, skipping" antes do `sync_lead_from_sale`) → agora cria card em RECOMPRA-POTES → "Recuperar"; `webhook_audit` era só Ticto → auditoria da Guru adicionada (Eduzz ainda pendente); lookup de lead por telefone exato falhava → `findLeadByContact` com formas BR + fallback e-mail. Copys do Guia/RevitaSoul refeitas (Guia entrega acessos Cademi). Investigação isolou que a parada geral de eventos às ~09:50 **não é do sistema** (entrega provada funcionando 5h depois) e sim tráfego/anúncios — pendente confirmação no Meta. _(PR #87, mergeado + deployado; copys direto no banco)_

### Auditorias & redesenho dos funis
- **[Auditoria & Redesenho dos Funis (2026-06-11)](./AUDITORIA-FUNIS-2026-06-11.md)** — auditoria em 4 frentes (modelagem · comportamento real dos clientes · benchmark de mercado · plano faseado). Diagnóstico: faltam 3 conceitos (estado do cliente, templates clonáveis, pedido-com-itens). Decisão: reforma faseada; Fase 1 = números corretos + recompra automática.
- **[Fase 1 — Números corretos + Recompra automática (2026-06-11)](./FASE1-FUNIS-2026-06-11.md)** — 1A: contar pedidos (taxa de recompra 31,1%→14,7%, aplicado no banco). 1B: cron de recompra reescrito com a lógica corrigida + deployado + validado (falta só o dono ligar). _(branch `claude/fase1-funis`)_

### Logística / Rastreios
- **[Módulo Logística / Rastreios](./RASTREIOS-LOGISTICA.md)** — aba `/rastreios` restrita: colou o código → botão "Enviar" → disparo controlado no WhatsApp pelo número dedicado (48 99211-2108, marca Soulnaturi, dedupe), com catálogo configurável de produtos que geram envio (`shipping_products`), drawer com todas as compras do cliente, auditoria de quem inseriu, NF do Spedy (XML/PDF) e status de entrega dos Correios. Corte operacional 10/06; planilha Santo Mato importada como base. **Disparo aguardando o "pode ligar"** (runbook de ativação na doc). _(PRs #18–#22 e #67–#71)_

### Arquitetura
- **[Arquitetura dos Funis](./ARCHITECTURE-FUNNELS.md)** — retrato atual dos dois sistemas de funil (`funnels` × `lead_funnels`) e a dívida de modelagem.

### Specs / próximas frentes
- **[Briefing: Auditoria & Redesign dos Funis](./specs/AUDITORIA-FUNIS-BRIEFING.md)** — escopo auto-contido da próxima auditoria (modelagem + comportamento dos clientes + benchmark de mercado + plano).

## Estado atual (2026-06-12)

| Frente | No banco/produção | No código (vai ao ar via Lovable) |
|---|---|---|
| Segurança | RLS + HIBP aplicados; 13 edge functions deployadas | PR #1 ✅ mergeado |
| Recompra | quantidade + backfill + config + 3 webhooks deployados | PR #2 ✅ mergeado |
| Modelagem de funis | — | auditado — plano faseado pronto (ver [auditoria](./AUDITORIA-FUNIS-2026-06-11.md)) |
| Funis · Fase 1A (números) | métricas por pedido aplicadas no banco | PR #3 ✅ mergeado |
| Funis · Fase 1B (recompra auto) | edge `recontact-cron` reescrita + deployada + **cron ativo** (diário 08:00 BRT) | PR #3 ✅ mergeado |
| Eco de expiração (leads re-datados) | RPC `sync_lead_from_sale` **v8** aplicada + 3 leads corrigidos | PRs #6/#7 ✅ mergeados (dedup timeline + permissão) |
| Permissão "Funil avançado" | coluna `mod_funil_avancado` aplicada | PR #7 ✅ mergeado (toggle na Equipe + trava Limpar Funil) |
| **Logística / Rastreios** | tabelas + 3 functions + 2 crons + webhook Spedy deployados; 1.173 pedidos (263 c/ rastreio, 0 na fila) | PRs #18–#22 ✅ mergeados |
| Rastreios · Correios (entrega) | infra + cron `correios-sync-6h` deployados (pula sem credencial) | ⏳ aguardando chave CWS |
| Rastreios · ManyChat (oficial) | — | ⏳ aguardando tag + deploy `manychat-sync` (param `fields`) |

> **Rastreios — pendências:** chave Correios CWS · tag/campo ManyChat + deploy `manychat-sync` · criar usuário logística (`mod_rastreios`) · investigar 384 vendas físicas marcadas como `digital`. Ver [doc do módulo](./RASTREIOS-LOGISTICA.md).
- **Republicar pela Lovable:** sempre **mergear o PR antes** de republicar — senão a Lovable sobe a versão antiga e desfaz as correções de edge functions.
- **Tokens:** os tokens de acesso (GitHub/Supabase) usados nas auditorias são descartáveis — **revogar após cada frente**. Uma nova sessão precisará de tokens novos.
