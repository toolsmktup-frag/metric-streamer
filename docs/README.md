# Documentação — metric-streamer ("Tráfego Lovable")

App interno de CRM de funis (Meta Ads, webhooks de venda Ticto/Guru/Eduzz, WhatsApp,
recompra de encapsulados). Stack: Vite + React + TS + Supabase. Uso interno (1 org).

> Supabase ref: `emfbocpmphtftqcezaib` · Repo: `Matheuscolombo/metric-streamer` (deploy via Lovable).

## Índice

### Auditorias & correções aplicadas
- **[Auditoria de Segurança (2026-06-10)](./AUDITORIA-SEGURANCA-2026-06-10.md)** — blindagem de ~13 edge functions expostas, RLS de tabelas órfãs, HIBP. Inclui pendências e checklist pré-deploy. _(PR #1, mergeado)_
- **[Correção Recompra/Recontato (2026-06-11)](./RECOMPRA-CORRECAO-2026-06-11.md)** — cálculo de recompra por quantidade de potes (fim do `-979d`), soma de compras, ingestão grava quantidade. _(PR #2)_

### Auditorias & redesenho dos funis
- **[Auditoria & Redesenho dos Funis (2026-06-11)](./AUDITORIA-FUNIS-2026-06-11.md)** — auditoria em 4 frentes (modelagem · comportamento real dos clientes · benchmark de mercado · plano faseado). Diagnóstico: faltam 3 conceitos (estado do cliente, templates clonáveis, pedido-com-itens). Decisão: reforma faseada; Fase 1 = números corretos + recompra automática.
- **[Fase 1 — Números corretos + Recompra automática (2026-06-11)](./FASE1-FUNIS-2026-06-11.md)** — 1A: contar pedidos (taxa de recompra 31,1%→14,7%, aplicado no banco). 1B: cron de recompra reescrito com a lógica corrigida + deployado + validado (falta só o dono ligar). _(branch `claude/fase1-funis`)_

### Arquitetura
- **[Arquitetura dos Funis](./ARCHITECTURE-FUNNELS.md)** — retrato atual dos dois sistemas de funil (`funnels` × `lead_funnels`) e a dívida de modelagem.

### Specs / próximas frentes
- **[Briefing: Auditoria & Redesign dos Funis](./specs/AUDITORIA-FUNIS-BRIEFING.md)** — escopo auto-contido da próxima auditoria (modelagem + comportamento dos clientes + benchmark de mercado + plano).

## Estado atual (2026-06-11)

| Frente | No banco/produção | No código (vai ao ar via Lovable) |
|---|---|---|
| Segurança | RLS + HIBP aplicados; 13 edge functions deployadas | PR #1 (mergeado na main) |
| Recompra | quantidade + backfill + config + 3 webhooks deployados | PR #2 (cálculo no front + UI) |
| Modelagem de funis | — | auditado — plano faseado pronto (ver [auditoria](./AUDITORIA-FUNIS-2026-06-11.md)) |
| Funis · Fase 1A (números) | métricas por pedido aplicadas no banco | PR `claude/fase1-funis` (migration) |
| Funis · Fase 1B (recompra auto) | edge `recontact-cron` reescrita + deployada + **cron ativo** (diário 08:00 BRT) | PR `claude/fase1-funis` (edge + testes) |

## ⚠️ Operacional
- **Republicar pela Lovable:** sempre **mergear o PR antes** de republicar — senão a Lovable sobe a versão antiga e desfaz as correções de edge functions.
- **Tokens:** os tokens de acesso (GitHub/Supabase) usados nas auditorias são descartáveis — **revogar após cada frente**. Uma nova sessão precisará de tokens novos.
