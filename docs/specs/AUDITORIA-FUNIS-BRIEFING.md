# Briefing — Auditoria & Redesign dos Funis (metric-streamer)

> Documento auto-contido para iniciar a próxima frente numa sessão nova (pós-`/compact`).
> Basta dizer ao agente: **"Leia e execute `docs/specs/AUDITORIA-FUNIS-BRIEFING.md`"**.

## Contexto do projeto
- App interno **"Tráfego Lovable"** (metric-streamer): CRM de funis de marketing (Meta Ads, webhooks de venda Ticto/Guru/Eduzz, WhatsApp, recompra de encapsulados). Stack Vite + React + TS + Supabase. Uso interno do Matheus (1 org, ~8 usuários, ~54k leads).
- Repo privado: `Matheuscolombo/metric-streamer` (branch default: `main`). Republica pela **Lovable**.
- Supabase ref: `emfbocpmphtftqcezaib`.
- Já foram feitas 2 frentes — ver [`../AUDITORIA-SEGURANCA-2026-06-10.md`](../AUDITORIA-SEGURANCA-2026-06-10.md) (segurança das edge functions) e [`../RECOMPRA-CORRECAO-2026-06-11.md`](../RECOMPRA-CORRECAO-2026-06-11.md) (recompra por quantidade de potes).

## Antes de começar
- **Peça tokens novos ao Lucas** (os anteriores foram revogados): GitHub (fine-grained no repo, com Contents/Pull requests) e Supabase (Personal Access Token `sbp_...`).
- **Leia [`../ARCHITECTURE-FUNNELS.md`](../ARCHITECTURE-FUNNELS.md) primeiro** — é o retrato atual dos funis.

## O problema (segundo o dono)
Os funis foram montados de forma improvisada ("gambiarra"), sem um conceito de **TIPO** de funil (tráfego, captura/leads, vendas, recompra). Cada funil novo exige reconfigurar muita coisa (etapas, produtos, regras, automações, webhook) → retrabalho. Ele quer saber se a modelagem está adequada e como ferramentas de mercado resolvem isso.

## Tarefa — auditoria completa em 4 frentes, terminando num plano

**1. Modelagem (código + banco):** mapeie a fundo os dois sistemas (`funnels` × `lead_funnels`), por que existem dois, o que é duplicado, onde está o retrabalho. Confirme se há (ou não) campo de tipo, templates, herança de config. Supabase read-only + leitura de código.

**2. Comportamento dos clientes (dados reais, read-only, SEM puxar PII para o chat — use agregados/contagens):** como os clientes compram e recompram? Jornada típica pelas etapas, tempo entre compra e recompra, taxa de recompra, ticket/LTV, potes por compra, conversão por etapa, onde os leads "empacam". Quantos funis existem e de que "tipo de fato" cada um é.

**3. Pesquisa de mercado (WebSearch):** como CRMs/ferramentas de funil modelam isto — RD Station, HubSpot, Pipedrive, Kommo/amoCRM, GoHighLevel, Klaviyo (retenção). Foque em: tipos de pipeline/funil, templates por tipo, automações por estágio, modelo de recompra/winback, e como separam "aquisição" de "retenção". Cite fontes.

**4. Plano:** proponha o redesenho — tipos de funil + templates (etapas/regras pré-prontas), unificação `funnels`×`lead_funnels`, fim do `traffic_funnel_id` 1:1 legado, e como migrar os funis atuais sem quebrar. Faseado, com riscos e verificação. Escopo de **app interno** (não over-engenheirar para multi-tenant).

## Entregáveis
- Um relatório em `docs/` (diagnóstico + comportamento + benchmark + plano faseado).
- Ao final, use o **plan mode** para apresentar o plano de implementação.
- Trabalhe em **branch separada** (o Lucas republica pela Lovable; mergear o PR antes de republicar).
- Confirme decisões de produto com **AskUserQuestion** antes de assumir.
