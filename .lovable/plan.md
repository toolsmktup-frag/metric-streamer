# Auditoria: Funil de Tráfego x Funil de Leads (CRM)

## TL;DR

Você não está viajando, mas também não precisa escolher entre um e outro. **Os dois já são integrados automaticamente** — o que está confuso é a UI, que faz parecer que são mundos separados. Hoje a regra real é:

> Toda venda que cai no funil de tráfego é automaticamente sincronizada como lead no CRM, no `lead_funnel` cujo produto bate com o produto vendido.

Ou seja: você **não precisa** transformar um no outro. Precisa entender o vínculo e, no máximo, simplificar a UI pra parar de pedir a mesma config em dois lugares.

---

## Como funciona hoje (auditado no código)

### 1. Tabela `funnels` = Funil de Tráfego
- Onde vivem: vendas (`sales`), ROI, CAC, atribuição de campanhas Meta.
- Recebe vendas via webhook das plataformas (Ticto, Guru, Kiwify, etc.) → `funnel_platforms.webhook_token`.
- Mapeia produto → funil via `funnel_products` (match por `product_id` ou `product_name_contains`).
- **Não tem Kanban, não tem etapas, não tem lead.**

### 2. Tabela `lead_funnels` = Funil de Leads (CRM)
- Onde vivem: leads, Kanban, etapas, automações WhatsApp, recontato, LTV.
- Mapeia produto → funil via `lead_funnel_products` (mesma lógica, tabela diferente).
- Recebe lead via:
  - Webhook próprio (`webhook-lead` + `X-Funnel-Token`) usado por captura/checkout.
  - **Sync automático** de vendas (RPC `sync_leads_from_sales`).

### 3. A ponte: RPC `sync_leads_from_sales` (já está rodando)
Para cada venda nova em `sales`:
1. Cria/atualiza o lead (por phone/email).
2. Posiciona no funil "Base de Leads".
3. Procura em `lead_product_mappings` + `lead_funnel_products` qual `lead_funnel` aceita aquele produto.
4. Posiciona o lead nesse funil, dispara `stage_transition_rules` (compra_aprovada → etapa Comprador, etc.).

**Resultado prático:** uma venda de "Recompra de Potes" que chega no funil de tráfego "Articulabem" já cai sozinha no funil CRM "Recompra de Potes", se você mapeou o produto lá.

### 4. O campo `traffic_funnel_id` em `lead_funnels`
É só um **ponteiro de atribuição de ROI**: "as vendas deste funil CRM contam como receita de qual funil de tráfego pro cálculo de CAC".  
Regra `traffic-funnel-link`: tráfego pago é atribuído ao funil onde acontece a **1ª compra** do lead. Recompra herda atribuição do funil de aquisição.

---

## Por que está parecendo confuso

Você configura **a mesma coisa em dois lugares**:

| Configuração         | Funil de Tráfego (`funnels`) | Funil CRM (`lead_funnels`) |
|----------------------|------------------------------|----------------------------|
| Produtos             | `funnel_products`            | `lead_funnel_products`     |
| Webhook plataforma   | `funnel_platforms` (1 token) | `webhook_token` (1 token)  |
| Match por product_id | sim                          | sim                        |

Dois lugares pra dizer "este produto pertence a este funil". Aí dá a sensação de que precisa escolher.

---

## Opções (escolha uma)

### Opção A — Não muda nada, só documenta
Hoje já funciona. Você só precisa garantir:
- Webhook das 2 contas Guru cadastrado em **um** funil de tráfego.
- Produto "Recompra de Potes" mapeado em `lead_funnel_products` do CRM "Recompra".
- `traffic_funnel_id` do CRM "Recompra" apontando pro funil de tráfego "Articulabem" (porque a 1ª compra é Articulabem).

**Custo:** zero. **Ganho:** zero (continua a sensação de duplicação).

### Opção B — Unificar produtos numa tabela só
Migrar `funnel_products` e `lead_funnel_products` pra uma tabela única `products` com FK pros dois funis. UI única "Produtos deste funil" que serve tanto pra atribuir receita quanto pra rotear lead.

**Custo:** migração grande, mexe em RPCs de sync, atribuição, dashboards. **Ganho:** UI deixa de mentir.

### Opção C — Auto-vincular ao criar
Quando criar um `lead_funnel`, oferecer "vincular a um funil de tráfego" e copiar os produtos automaticamente. Mantém as duas tabelas, mas a UI esconde a duplicação.

**Custo:** médio. Só mexe em UI + 1 RPC de cópia. **Ganho:** boa parte da confusão some sem migração de dados.

### Opção D — Eliminar `funnels` (funil de tráfego)
Transformar `lead_funnels` no único funil. Receita, CAC, ROI, Kanban tudo no mesmo objeto. `traffic_funnel_id` vira o próprio `lead_funnel.id`.

**Custo:** altíssimo. Reescreve dashboards, atribuição Meta, KPIs, CAC, escada de valor. **Ganho:** modelo mental simples, mas semanas de trabalho.

---

## Recomendação

**Opção C** resolve 80% da dor com 10% do esforço da B/D:
- Você continua com 2 funis (tráfego pra ROI, CRM pra operação) — útil porque os papéis são diferentes.
- Mas a UI deixa de pedir produto duas vezes.
- Mantém compatibilidade com tudo que existe (Meta Ads, CAC, automações, atribuição).

Para o seu caso específico de "Recompra de Potes":
- Funil de tráfego: **Articulabem** (recebe webhook das 2 contas Guru, conta a receita).
- Funil CRM "Recompra de Potes": `traffic_funnel_id` → Articulabem. Produtos mapeados aqui só pra rotear o Kanban.
- Zero anúncio novo, zero campanha duplicada.

---

## Detalhes técnicos

Arquivos relevantes:
- `supabase/functions/webhook-lead/index.ts` — entrada de lead via captura.
- `supabase/functions/sync-leads-from-sales/index.ts` + `docs/rpc-sync-lead-from-sale-v5.sql` — ponte venda → CRM.
- `src/hooks/useFunnels.ts` — funil de tráfego.
- `src/hooks/useLeadFunnels.ts` + `useLeadFunnelProducts.ts` — funil CRM.
- `src/pages/LeadCampaigns.tsx` (linhas 251-401) — UI atual do `traffic_funnel_id`.

Me diga qual opção você quer e eu monto o plano de implementação detalhado.
