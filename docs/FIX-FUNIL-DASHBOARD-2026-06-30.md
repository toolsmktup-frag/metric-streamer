# Fix: order bump, consistência Resumo×KPI e vínculo de campanhas

**Data:** 2026-06-30 · **PRs:** #41, #42 · **Status:** ✅ código mergeado na main + dados corrigidos em prod

Investigação que começou em "o order bump do Guia de Tinturas não está marcando" e desdobrou em três problemas distintos de consistência do dashboard de funil. Tema comum: a **fonte de verdade da classificação por funil é `funnel_products` → `mapped_funnel_id`/`funnel_position`** (via view `v_all_sales_classified`), e o **investimento vem de `meta_campaigns` vinculadas ao funil**.

---

## 1. Order bump Ticto não marcava (Guia de Tinturas)

**Causa raiz.** Neste checkout a Ticto envia o webhook só com o produto **principal** em `item` (R$47, id 46342), mas `order.paid_amount` traz o **total do pedido** (R$74 = principal + bump "Guia de Chás" R$27). O `ticto-webhook` gravava esse total no registro do principal (`extractPaidAmountCents` usa `order.paid_amount` como 1º candidato), então o bump **nunca virava uma linha própria**: coluna do bump zerada e ticket do principal inflado. A receita do bump já estava contabilizada (embutida no principal) — era problema de **atribuição/visibilidade, não de receita perdida**.

Prova (junho/2026): produto 46342 tinha **456 registros de R$47 e 39 de R$74** = exatamente os R$24.318 da view. O produto-bump (47627) chegava como postback separado até mar/2026; no checkout novo (46342, desde maio) deixou de vir separado.

**Correção.**
- **`ticto-webhook` (PR #41):** quando `order.paid_amount > item.amount` **e** o funil tem um `order_bump` cadastrado em `funnel_products` (platform Ticto/agnóstica), grava **2 linhas**: principal = `item.amount`, bump = diferença (com o `product_id` do order_bump). Total preservado; idempotente via `(order_id, product_id)`; `transaction_hash` do bump recebe sufixo `-BUMP` (UNIQUE). CAPI/lead seguem reportando o **total** do pedido (`reportedAmountCents`) — não afeta otimização do Meta.
- **Backfill junho/2026:** 50 registros R$74 → principal R$47 + bump R$27 (47627).

**Validação (junho, Guia de Tinturas):**

| funnel_position | antes | depois |
|---|---|---|
| principal | 495 vendas / R$24.318 | 495 / **R$23.265** (R$47/un) |
| **bump1** | 0 | **39 / R$1.053** |
| upsell1 | 26 / R$3.687 | 26 / R$3.687 |
| **Total** | R$28.005 | **R$28.005** (inalterado) |

> ⚠️ Backfill cobriu **só junho** (todos os R$74 = 47+27, determinístico). O histórico do 46342 (desde mai/2025) tem `paid_amount` muito variado, onde "> R$47" **não** é sinônimo de bump — backfillar exige `item.amount` real do `webhook_audit`, caso a caso.

---

## 2. Resumo do funil divergia da KPI (mesmo funil)

**Causa raiz.** O "Faturamento Líquido" do resumo de um funil específico não batia com a KPI. Ex. Guia de Tinturas: Resumo R$30.667 × KPI R$27.958 (Δ R$2.709,60). O `belongsToFunnel` (`useAllSales.ts`) aceitava `funnel_id === id || mapped_funnel_id === id`, e o `funnel_id` pode ser **herdado** de outra venda do mesmo cliente (`resolveInheritedAttribution`), puxando produtos de **outro funil**. As 2 vendas que inflavam o Guia eram o **"Combo Erveiros"** (R$1.513 + R$1.196), do funil Erveiros, de clientes que também compraram tinturas.

**Correção (PR #42).** `belongsToFunnel = mapped_funnel_id === funnelId` — o **produto** define o funil (fonte durável via `funnel_products`). Só afeta telas de **funil específico** (FunilResumo, FunilCampanhas); o **Resumo Geral** não passa `funnelId` e continua somando tudo.

**Impacto medido (junho):** Guia/Articulabem com total inalterado; vendas passam ao funil do produto (Erveiros passou a enxergar suas vendas); **0 vendas legítimas sumiram** (nenhuma com `funnel_id` e sem produto cadastrado). `f0bff5cf` era `funnel_id` órfão (nem existe em `funnels`).

> O resumo do funil Guia passou a mostrar o **lucro real** (~−R$1.550, igual à KPI). O "+R$1.158" anterior era o Combo Erveiros vazando.

---

## 3. Investimento R$0 na KPI do Articulabem

**Causa raiz.** A KPI puxa o investimento de `meta_campaigns` vinculadas ao funil (`FunilKpi.tsx`: campaign ids do funil → `meta_insights.spend`). O funil **"Articulabem - 1"** tinha **0 campanhas vinculadas** → investimento R$0 (mesmo com R$86k de vendas). As **33 campanhas** de anúncio do Articulabem estavam amarradas ao funil **"Clube Secreto"** (`65b224bb`, **`is_active=false`**, criado 17/05) — gasto órfão num funil inativo. Pré-existente; sem relação com os itens 1 e 2.

**Correção.** Re-vinculadas as 33 campanhas (`name ILIKE 'articulabem'` & funnel inativo) → funil "Articulabem - 1" (`PATCH meta_campaigns.funnel_id`).

**Validação (junho, Articulabem-1):**

| | antes | depois |
|---|---|---|
| Investimento | R$ 0,00 | **R$ 28.385,66** |
| Faturamento | R$ 86.270 | R$ 86.270 |
| Lucro | (falso) R$ 86.270 | **R$ 57.885** |
| ROAS | — | **3,04x** |

---

## Observações

- Itens 1 e 3 corrigem **dados em prod** (independem de republish da Lovable). Item 2 é código no front (depende do deploy).
- Lição recorrente (ver também `AUDITORIA-FUNIS-2026-06-11`, `FIX-DUPLA-CONTAGEM-2026-06-12`): cada tela tinha sua própria definição de "pertence ao funil". A regra agora é única — **o produto define o funil** (`mapped_funnel_id` via `funnel_products`); `funnel_id` da transação é atribuição e pode ser herdado.
- Ao diagnosticar ROI/investimento errado num funil, checar `meta_campaigns` vinculadas e **funis inativos com gasto órfão**.
