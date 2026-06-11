# Auditoria & Redesenho dos Funis — metric-streamer ("Tráfego Lovable")

> Data: 2026-06-11 · Escopo: app interno (1 org, ~8 usuários) · Método: 4 frentes
> (modelagem de código+banco · comportamento real dos clientes · benchmark de mercado · plano).
> Base do briefing: [specs/AUDITORIA-FUNIS-BRIEFING.md](./specs/AUDITORIA-FUNIS-BRIEFING.md) ·
> Arquitetura atual: [ARCHITECTURE-FUNNELS.md](./ARCHITECTURE-FUNNELS.md).

## Sumário executivo

A dor relatada ("os funis são uma gambiarra, sem conceito de TIPO, e cada funil novo exige
reconfigurar tudo") foi confirmada — **mas o diagnóstico é mais preciso que "falta um campo de tipo".**

O benchmark mostrou que **nenhuma** das 7 ferramentas líderes (HubSpot, RD Station, Pipedrive,
Kommo, GoHighLevel, Klaviyo, ActiveCampaign) tem "tipo de funil" como campo de schema — todas usam
funil genérico + convenção. O que elas têm e o metric-streamer **não** são **três conceitos**:

| Conceito faltante | O que é | Evidência nos dados reais |
|---|---|---|
| **Estado do cliente** (separado da etapa do funil) | "Ativo / Em risco / Lapsado" vive no *cliente*, não no funil — o "lifecycle stage" do HubSpot | **96,7% dos clientes (35.079) estão dormentes** (>180d sem comprar) e o sistema não enxerga isso |
| **Templates clonáveis** | Criar funil = clonar um modelo pronto (etapas+regras+produtos), não montar 10 coisas — o "clone pipeline" / "Snapshot" do mercado | O funil **"Visão Geral" tem 12 etapas e 0 leads** — um template feito à mão que ninguém reaproveitou |
| **Pedido com itens** | Order bump/upsell são linhas de *um pedido*, não compras separadas | **59% das "recompras" são no mesmo dia** (order bumps); **14,9% dos pedidos têm múltiplos itens** |

E o que o projeto **já acertou** — recompra por "dias de estoque" (1 pote = 30 dias) — o mercado
confirma como o padrão correto (replenishment do Klaviyo), e **os dados reais validam**: a recompra
verdadeira tem mediana de **35 dias**, batendo no ciclo do pote.

**Decisão do dono (2026-06-11):** reforma **faseada, começando pelo essencial** (baixo risco),
com prioridade nos dois incômodos: **(a) números que não batem** e **(b) recompra ainda manual**.
O plano na Seção 5 reflete essa escolha.

---

## 1. Diagnóstico da modelagem (código + banco)

### 1.1 Dois sistemas paralelos, sem tipo

| Sistema | Tabelas-núcleo | Papel |
|---|---|---|
| **A — `funnels`** (tráfego/vendas) | `funnels`, `funnel_products` (role: front/order_bump/upsell/downsell), `funnel_platforms` | Resolve a venda de um webhook a um funil por **texto** (`resolve_funnel_id` via `ILIKE '%fragmento%'`) |
| **B — `lead_funnels`** (CRM/jornada) | `lead_funnels`, `lead_funnel_stages`, `stage_transition_rules`, `lead_funnel_products`, `lead_stage_positions`, `leads` | Jornada do lead (Kanban), automações evento→etapa, recontato/recompra |

Conexão A↔B: `lead_funnels.traffic_funnel_id` (**1:1 legado, deprecated**) coexiste com
`lead_funnel_traffic_funnels` (**M:N novo**) — dois mecanismos para a mesma ligação.

Camada transversal de cliente: `unified_customers` + `customer_identity_links` (índice email/CPF/phone)
+ `customer_purchases`. **Não há FK direta `leads → unified_customers`** — o match lead→compras é feito
em runtime por email/telefone (com variantes), no front (`useBulkLeadPurchaseProducts`).

### 1.2 Ausência total de tipo/template

Busca confirmada: **não existe** `funnel_type`, `kind`, `category`, `template_id`, `is_recompra` em
nenhuma tabela. Os "tipos" (recompra, lançamento, base, visão geral) existem **só como convenção no
nome** + configuração manual específica. Nenhum template, nenhuma herança, nenhum "clonar".

### 1.3 O retrabalho: 10 pontos manuais por funil novo

Criar um funil novo exige configurar, **um a um e do zero**: (1) o registro do funil, (2) as etapas,
(3) as regras de transição evento→etapa, (4) os produtos (fragmentos ILIKE), (5) duração do estoque,
(6) etapa de auto-mover (recontato), (7) etapa de origem do auto-mover, (8) vínculo com campanhas,
(9) vínculo com funis de tráfego, (10) automações de WhatsApp. **0% automatizado.**

### 1.4 Match por texto = a causa-raiz recorrente

Tanto `resolve_funnel_id` (sistema A) quanto `sync_lead_from_sale` (sistema B) casam produto por
`ILIKE '%product_name_contains%'`. É frágil a acento/variação/typo — foi a **causa-raiz do bug de
recompra** já corrigido (ver [RECOMPRA-CORRECAO-2026-06-11.md](./RECOMPRA-CORRECAO-2026-06-11.md)) e
continua sendo a fragilidade estrutural número 1.

### 1.5 Os 8 problemas ranqueados (resumo da Frente 1)

1. 🔴 Ausência de tipo/template (cada funil é "snowflake").
2. 🔴 Match por texto frágil (`ILIKE`) na resolução de funil/produto.
3. 🔴 Dois sistemas (A/B) divergindo, ligados de forma retroativa.
4. 🟠 `leads` sem FK para `unified_customers` (match sempre em runtime).
5. 🟠 Faixas de duração da recompra hardcoded em seed (não configuráveis por UI por funil).
6. 🟡 Dedup de leads vulnerável a variações de telefone/nome.
7. 🟡 "BASE DE LEADS" criada dinamicamente em RPC (risco de duplicação/race).
8. 🟡 Zero auditoria de configuração (sem `created_by`/`updated_at` nas tabelas de config).

---

## 2. Comportamento real dos clientes (dados de 2026-06-11)

> Todos os números são agregados (sem dado pessoal). Fonte: queries read-only na produção.

### 2.1 Escala

**54.886 leads** · **36.657 clientes** · **69.276 compras** (68.482 `authorized`, somando **R$ 5,99 mi**).
9 funis de tráfego (4 ativos) · 8 funis de leads (8 ativos) · 58 etapas · 26 regras de transição.

### 2.2 Inventário — muito funil "casca"

**Funis de tráfego (A):** concentração extrema.

| Funil | Plataforma | Compras | % |
|---|---|---|---|
| Guia de Tinturas | ticto | 55.882 | **80,7%** |
| Articulabem - 1 | guru | 1.324 | 1,9% |
| Mestre das Tinturas - VSL | ticto | 24 | — |
| RevitaSoul / Clube Secreto / Erveiros / Influencers / Revolução do Ser / teste | — | 0–8 | ~0% |

**Funis de leads (B):** muitas etapas configuradas, leads em poucas.

| Funil | Etapas | Regras | Leads | Observação |
|---|---|---|---|---|
| BASE DE LEADS | 2 | 0 | 48.388 | Balde único — todos em "Comprador", 0 em "Perdido" |
| Infoprodutos | 6 | 7 | 3.814 | Pipeline de vendas genérico (1:1 legado) |
| [LANC] O Poder Holístico das Ervas | 9 | 6 | 3.794 | Lançamento — 2.356 "Entrou no grupo", só 38 "Comprou" |
| Influencers | 6 | 5 | 1.443 | 1.329 em "Novo Lead", 114 aprovados |
| Webinar Diário | 11 | 1 | 786 | Leads só nas 3 primeiras etapas; **8 etapas vazias** |
| RECOMPRA - POTES | 10 | 7 | 722 | **O único pipeline que opera de verdade** (1:1 legado) |
| Dia das Mães/26 | 2 | 0 | 404 | Captura |
| Visão Geral | 12 | 0 | **0** | **Template feito à mão, nunca usado** |

### 2.3 Recompra e intervalo — a descoberta central

- **"Taxa de recompra" aparente: 31,1%** (clientes com 2+ compras) — **mas é ilusória.**
- **59,2% dos intervalos entre compras são no mesmo dia** = order bumps/upsells contados como
  compras separadas. Confirmado pelo lado dos pedidos: **14,9% dos pedidos têm múltiplos itens** (até 19).
- **Excluindo o mesmo dia, a recompra real tem mediana de 35 dias** (p25 = 28,6d; p75 = 168d; p90 = 404d).
  → **bate exatamente no ciclo de 1 pote = 30 dias.** Os dados validam o modelo de recompra por
  "dias de estoque" que já implementamos. É também o padrão de mercado (Klaviyo *replenishment*).

Distribuição de compras por cliente: 1x = 24.995 (68,9%) · 2x = 7.846 · 3x = 2.175 · 4–6x = 949 · 7+ = 310.
Quantidade de potes: a grande maioria é 1 pote (compra única/infoproduto); os multi-pote reais são
~1.227 compras (3 potes = 940, 6 = 145, 9 = 69, 12 = 35).

### 2.4 Recência — a base está dormindo

| Última compra | Clientes | % |
|---|---|---|
| 0–30 dias (ativos) | 256 | 0,7% |
| 30–60 dias | 357 | 1,0% |
| 60–90 dias | 210 | 0,6% |
| 90–180 dias | 373 | 1,0% |
| **+180 dias (dormentes)** | **35.079** | **96,7%** |

Uma base de **35 mil clientes parada** e invisível ao sistema — a maior oportunidade latente, e
impossível de trabalhar hoje porque não existe "estado do cliente".

### 2.5 Ticket / LTV

Ticket médio **R$ 87,69** (mediana R$ 47, p90 R$ 147). LTV médio **R$ 142** (mediana R$ 47),
**1,52 pedidos por cliente**. Negócio de volume e ticket baixo (infoproduto domina) + um motor
de produto físico/recompra menor em quantidade, porém de maior valor por cliente.

---

## 3. Benchmark de mercado (como os líderes resolvem)

### 3.1 O padrão real: pipeline genérico + convenção (não "tipo" no schema)
Nenhuma das 7 ferramentas modela "tipo de funil" como campo. A reutilização ("não reconfigurar do
zero") vem de **dois mecanismos**: **clonar/duplicar pipeline** (HubSpot "Clone from existing",
Pipedrive "Duplicate", Kommo "templates") e, no extremo, **Snapshots** (GoHighLevel — clona
pipelines + etapas + workflows + automações num pacote, com Merge/Override).

### 3.2 Os dois eixos ortogonais (a lição-mãe, do HubSpot)
- **Lifecycle stage** vive no **cliente/contato**: descreve a relação geral
  (Subscriber → Lead → MQL → SQL → Opportunity → **Customer** → Evangelist). É **um por contato** e
  **forward-only**. A ponte: deal ganho → contato vira "Customer".
- **Deal/funnel stage** vive na **negociação**, dentro de um pipeline (várias por contato).
- **Klaviyo** (e-commerce sem "deal") substitui o eixo de negociação por **segmentos dinâmicos**
  (Recent / Active / At-risk / Lapsed) onde o cliente entra/sai automaticamente.

### 3.3 Recompra de consumíveis = replenishment por `supply_days`
Só o Klaviyo tem nativo (**Expected Date of Next Order** + **Average Time Between Orders**). A
matemática replicável e leve: `próxima_compra ≈ data_do_pedido + dias_de_estoque_do_produto`,
lembrete a **~0,85 × ciclo**, winback a **~2 × ciclo**, sempre com **condição de saída**
("recomprou desde o início do fluxo → sai"). É exatamente o caminho já iniciado aqui.

### 3.4 Lições aplicáveis a um app interno (sem over-engineering)
**Copiar:** (1) separar os dois eixos (estado do cliente × etapa do funil); (2) `funnel_type` como
enum simples só para filtrar relatório e escolher template; (3) "clonar funil" copiando
etapas+regras+produtos juntos; (4) automação por etapa como **regra que referencia** a etapa (não
copiada dentro dela); (5) recompra por `supply_days`; (6) estado por recência ancorada no ciclo;
(7) exit condition obrigatória no fluxo de recompra.
**Não copiar (exagero p/ 1 org):** Snapshots multi-conta completos; analytics preditivo/ML estilo
Klaviyo; 8 lifecycle stages + métricas de tempo-em-estágio; win probability/forecast; lead scoring
B2B; marketplace de templates.

---

## 4. Diagnóstico cruzado — os 3 conceitos faltantes

1. **Estado do cliente** (lifecycle) — hoje misturado com a etapa do funil. A "BASE DE LEADS" tenta
   ser isso (Comprador/Perdido), mas é um balde morto. Os 96,7% dormentes provam que o eixo importa.
2. **Templates clonáveis** — "Visão Geral" (12 etapas, 0 leads) é a prova de que se tentou criar um
   modelo reutilizável e não houve mecanismo para reaproveitar.
3. **Pedido com itens** — order bumps/upsells (14,9% dos pedidos) viram "compras" e inflam a recompra.

---

## 5. Plano faseado de redesenho

> **Princípios:** app interno, baixo risco, *additive-first* (adicionar conceitos sem quebrar o que
> roda), cada fase entrega valor sozinha e é revisada antes da próxima. Não over-engenheirar para
> multi-tenant nem para ML. O front sobe pela Lovable (mergear o PR antes de republicar).

### Fase 1 — Números corretos + Recompra automática  ⭐ PRIORIDADE DO DONO

**1A · "Pedido com itens" (corrige os números).**
Introduzir o conceito de pedido agrupando `customer_purchases` por `platform_order_id`
(fallback: cliente + janela de tempo, para os 7% sem id). Order bump/upsell deixam de contar como
recompra; a "taxa de recompra" passa a refletir pedidos distintos ao longo do tempo. Ajustar a
recompra para somar potes **dentro do pedido** (estoque) sem tratar a 2ª linha como novo ciclo.
- *Risco:* baixo (additive — uma view/coluna derivada; não apaga dados).
- *Verificação:* recomputar a taxa de recompra antes/depois; conferir alguns pedidos multi-item.

**1B · Recompra automática (fim do botão manual).**
Substituir o botão "Atualizar Funil" por um job agendado, **seguindo o padrão que já existe**
(pg_cron + pg_net → edge function com service_role, como `auto-rules-engine-cron`). A função reusa
a lógica já testada de `src/lib/recompra.ts` (portada para `_shared`) e o match cliente→compras.
- *Rollout seguro:* (i) modo **dry-run** que só registra o que moveria; (ii) rodar em paralelo ao
  botão por alguns dias e comparar; (iii) ativar o movimento real respeitando a etapa de origem
  (não atropela negociação) e com log de auditoria.
- *Risco:* médio, mitigado pelo dry-run e pelo padrão de cron já existente.

### Fase 2 — Estado do cliente (lifecycle) + base dormente

Adicionar `lifecycle_stage` ao cliente (ex.: Lead → Comprou 1ª vez → Ativo → Em risco → Lapsado →
Recuperado), derivado da recência **ancorada no ciclo de recompra** (at-risk ≈ 1–1,5× estoque;
lapsado ≈ 2–3×). Painel da base por estado → torna os 35k dormentes visíveis e acionáveis (winback).
- *Risco:* baixo-médio (uma coluna + job de classificação; sem quebrar funis).

### Fase 3 — Tipos de funil + templates clonáveis

`funnel_type` enum (`trafego` | `captura` | `vendas` | `recompra` | `visao_geral`) + "clonar funil"
que copia etapas + regras + produtos de um modelo. 4–5 templates-semente (1 por tipo) a partir dos
melhores funis atuais (RECOMPRA-POTES e Infoprodutos são bons pontos de partida). Mata o retrabalho
dos 10 pontos manuais.
- *Risco:* baixo (additive); maior esforço de UI.

### Fase 4 — (futuro/opcional) Unificação dos dois sistemas

Unificar `funnels` (A) e `lead_funnels` (B) numa fundação só, aposentar o `traffic_funnel_id` 1:1,
trocar match por texto por FK ao catálogo de produtos. **Alto valor, alto risco** — só após Fases 1–3
estabilizarem e com decisão explícita. Pode nunca ser necessário se o app interno seguir pequeno.

### O que NÃO fazer (para não recriar a gambiarra do outro lado)
Sem ML/CLV preditivo; sem forecast/win-probability; sem lead scoring B2B; sem Snapshots multi-conta;
sem marketplace de templates. Manter automação como **regra que referencia a etapa**, nunca copiada.

---

## 6. Riscos e verificação

| Risco | Mitigação |
|---|---|
| Mover leads errado na automação | Dry-run + comparação com o botão + respeitar etapa de origem + log |
| Agrupar pedido errado (7% sem `order_id`) | Fallback por cliente+janela de tempo; medir cobertura antes |
| Quebrar funis existentes | Tudo *additive*; nada de DROP; migrações reversíveis; testar no funil RECOMPRA-POTES primeiro |
| Front desatualizado na Lovable | **Mergear o PR antes de republicar** (senão a Lovable sobe versão antiga) |

## 7. Decisões registradas (2026-06-11)
- Ambição: **faseada, começar pelo essencial** (baixo risco).
- Prioridade da Fase 1: **números corretos** + **recompra automática**.
- Confirmado anteriormente: 1 pote = 30 dias; múltiplas compras somam estоque; recompra por duração.
- Pendente de decisão futura: nomes exatos dos `lifecycle_stage` (Fase 2) e dos `funnel_type`/templates (Fase 3).

> **Próximo passo:** apresentar o plano de implementação da **Fase 1** para aprovação e, ao aprovar,
> executar em branch separada (`claude/auditoria-funis` ou similar), com PR mergeado antes de republicar.
