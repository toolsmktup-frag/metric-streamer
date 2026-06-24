# Documentação — metric-streamer ("Tráfego Lovable")

App interno de CRM de funis (Meta Ads, webhooks de venda Ticto/Guru/Eduzz, WhatsApp,
recompra de encapsulados). Stack: Vite + React + TS + Supabase. Uso interno (1 org).

> Supabase ref: `emfbocpmphtftqcezaib` · Repo: `Matheuscolombo/metric-streamer` (deploy via Lovable).

## Índice

### Auditorias & correções aplicadas
- **[Auditoria de Segurança (2026-06-10)](./AUDITORIA-SEGURANCA-2026-06-10.md)** — blindagem de ~13 edge functions expostas, RLS de tabelas órfãs, HIBP. Inclui pendências e checklist pré-deploy. _(PR #1, mergeado)_
- **[Correção Recompra/Recontato (2026-06-11)](./RECOMPRA-CORRECAO-2026-06-11.md)** — cálculo de recompra por quantidade de potes (fim do `-979d`), soma de compras, ingestão grava quantidade. _(PR #2)_
- **[Eco de expiração Guru + Permissão "Funil avançado" (2026-06-12)](./FIX-ECO-EXPIRACAO-2026-06-12.md)** — boleto/PIX expirado dias depois re-datava leads em "Recuperar" como se fossem tentativas de hoje; RPC v8 com gate de frescor 48h + `original_date` (aplicada em prod). Dedup da timeline. Permissão individual para liberar as abas extras do funil por vendedor + trava no "Limpar Funil". _(PRs #6 e #7, mergeados)_

### Auditorias & redesenho dos funis
- **[Auditoria & Redesenho dos Funis (2026-06-11)](./AUDITORIA-FUNIS-2026-06-11.md)** — auditoria em 4 frentes (modelagem · comportamento real dos clientes · benchmark de mercado · plano faseado). Diagnóstico: faltam 3 conceitos (estado do cliente, templates clonáveis, pedido-com-itens). Decisão: reforma faseada; Fase 1 = números corretos + recompra automática.
- **[Fase 1 — Números corretos + Recompra automática (2026-06-11)](./FASE1-FUNIS-2026-06-11.md)** — 1A: contar pedidos (taxa de recompra 31,1%→14,7%, aplicado no banco). 1B: cron de recompra reescrito com a lógica corrigida + deployado + validado (falta só o dono ligar). _(branch `claude/fase1-funis`)_

### Logística / Rastreios
- **[Módulo Logística / Rastreios](./RASTREIOS-LOGISTICA.md)** — aba `/rastreios` restrita: a logística cola o código → disparo controlado no WhatsApp (ManyChat tag / UazAPI), NF do Spedy (XML/PDF) e status de entrega dos Correios. Planilha Santo Mato importada como base (de-para com as vendas). _(PRs #18–#22, mergeados)_

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
