# Arquitetura dos Funis — estado atual (2026-06-11)

> Retrato de como os funis funcionam hoje. Serve de base para a auditoria de redesenho
> (ver [specs/AUDITORIA-FUNIS-BRIEFING.md](./specs/AUDITORIA-FUNIS-BRIEFING.md)).
> **Resumo:** existem DOIS sistemas de funil paralelos, sem conceito de "tipo", o que gera
> retrabalho de configuração a cada funil novo.

> **Atualização 2026-06-30** — a classificação de venda por funil ficou **durável no banco**:
> a view `v_all_sales_classified` deriva `funnel_position`/`mapped_role`/`mapped_funnel_id`
> de `funnel_products` (match por `product_id`+`platform`, fallback `product_name_contains`).
> **Regra única hoje: o produto define o funil** (`mapped_funnel_id`); o `funnel_id` da
> transação é atribuição e pode ser herdado entre vendas do mesmo cliente. O **investimento**
> de um funil vem de `meta_campaigns` vinculadas a ele. Detalhes e correções recentes em
> `FIX-FUNIL-DASHBOARD-2026-06-30.md` (order bump embutido, Resumo×KPI, vínculo de campanhas).

## Os dois sistemas

### A) `funnels` — funil de tráfego/vendas
Rastreia **vendas por produto**, alimentado por webhooks de plataforma.
- `funnels` (id, name, color, `meta_account_id`, `platform`, `webhook_token`, is_active…) — **sem campo de tipo**.
- `funnel_products` — produtos por `role` (front, order_bump, upsell1-3, downsell), com `product_name_contains` (match ILIKE).
- `funnel_platforms` — M:N funil × plataforma de pagamento (um webhook por plataforma).
- `resolve_funnel_id(product_name)` — resolve o funil de uma venda por ILIKE do nome.

### B) `lead_funnels` — funil de CRM/leads
Rastreia a **jornada do lead** (etapas, automações, Kanban).
- `lead_funnels` (id, campaign_id, name, color, `webhook_token`, `traffic_funnel_id`, `meta_pixel_id`…) — **sem campo de tipo**.
- `lead_funnel_stages` — etapas (capture, sales, checkout, thankyou, upsell, downsell, content).
- `stage_transition_rules` — regras evento→stage_origem→stage_destino.
- `lead_funnel_products` — produtos + recontato (`recontact_days`, `pot_duration_days`, `reminder_days_before`, `auto_move_stage_id`/`from`).
- `lead_stage_positions` (lead_id, funnel_id, stage_id, entered_at) — posição do lead no Kanban.
- `leads` — base de leads (email, phone, metadata…).

### Conexão entre eles
- `lead_funnels.traffic_funnel_id` — vínculo **1:1 legado** (deprecated).
- `lead_funnel_traffic_funnels` — vínculo **M:N novo** (múltiplos funis de tráfego → 1 funil de leads).
- Importação de vendas → leads via `ImportFromTrafficFunnelDialog`.

## Camada de cliente / compras (transversal)
- `customer_purchases` — todas as compras (unified_customer_id, product_name, offer_name, `quantity`, purchased_at, status). Populada por guru/eduzz-webhook e process-import.
- `unified_customers` — cliente unificado (primary_email, primary_phone).
- `customer_identity_links` — liga identificadores (email/phone) ao unified_customer.
- **Match lead → compras:** por email/phone (com variantes de telefone) — não há FK direta `lead → unified_customer`.

## A dívida de modelagem (a "gambiarra")
1. **Dois sistemas sem tipo:** `funnels` e `lead_funnels` resolvem o mesmo problema (organizar jornada) com estruturas separadas. Não há `funnel_type` (traffic/leads/sales/retention).
2. **Sem templates:** cada funil novo é configurado do zero (etapas, produtos, regras, automações, webhook, mapeamentos). Não há "clonar tipo X".
3. **Vínculo tráfego↔leads em transição:** `traffic_funnel_id` (1:1) coexiste com `lead_funnel_traffic_funnels` (M:N).
4. **Match por texto:** produtos casam por `product_name_contains` (ILIKE), frágil — foi a causa-raiz do bug de recompra (ver RECOMPRA-CORRECAO).

## Componentes de front relevantes
- `src/pages/LeadFunnelDetail.tsx` — página do funil de leads (Kanban + abas).
- `src/pages/FunisConfigurar.tsx` — gerência dos funis de tráfego.
- `src/components/lead-funnels/` — `FunnelConfigTab`, `FunnelProductsConfig`, `KanbanBoard`, `LeadCard`, `ImportFromTrafficFunnelDialog`…
- `src/hooks/` — `useFunnels`, `useLeadFunnels`, `useLeadFunnelProducts`, `useRecontactDeadlines`, `useBulkLeadPurchaseProducts`.

> Fonte: exploração de código + schema em `docs/sql/` (migrations `lead_funnel_*`, `multi_funnel_foundation`).
