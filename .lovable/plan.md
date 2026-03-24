

# Auditoria Completa — Módulo Lead Funnels / CRM

## Resumo Executivo

Analisei em profundidade todos os pontos de entrada, posicionamento, vínculo venda-lead, produtos, Edge Functions e frontend. Abaixo está o relatório organizado por prioridade.

---

## BUGS E RISCOS ENCONTRADOS

### CRITICO

**1. sync_lead_from_sale coloca leads APENAS no funil "BASE DE LEADS", nunca no funil do produto**

A RPC `sync_lead_from_sale` (docs/rpc-sync-lead-from-sale.sql) tem hardcoded:
```sql
WHERE organization_id = v_org_id AND name = 'BASE DE LEADS'
```
Quando uma venda da Eduzz/Guru/Ticto chega via webhook, o lead é criado e posicionado exclusivamente no funil "BASE DE LEADS". Ele **nunca** aparece automaticamente no funil específico do produto (ex: "Funil Articulabem").

Isso significa que o fluxo descrito ("venda da plataforma cai no funil do produto correspondente") **não funciona hoje**. Os leads só chegam ao funil do produto se forem importados manualmente via CSV/planilha usando o `useImportLeads`, que posiciona no funil selecionado pelo usuário.

**Correção necessária**: A RPC precisa receber `p_product_name` e usar a tabela `lead_product_mappings` ou `lead_funnel_products` para resolver o funil correto dinamicamente, posicionando o lead tanto na "BASE DE LEADS" quanto no funil do produto.

---

**2. Eduzz grava em `ticto_transactions` em vez de `customer_purchases`**

O webhook da Eduzz (eduzz-webhook/index.ts, linha 200-202) faz upsert na tabela `ticto_transactions`. Já o webhook da Guru grava em `customer_purchases`. Isso cria duas fontes de dados inconsistentes:

- **LTV do lead** (`useLeadPurchases`) busca **apenas** em `customer_purchases` via `unified_customers`. Vendas da Eduzz que estão apenas em `ticto_transactions` **não aparecem no LTV** a menos que a view `v_all_sales` as inclua e o hook as consuma.
- **`useBulkLeadPurchases`** usa a RPC `get_bulk_purchase_summaries` que provavelmente também cruza com `customer_purchases`.
- Resultado: LTV de clientes Eduzz pode estar **subcontabilizado**.

**Correção necessária**: Eduzz deveria gravar em `customer_purchases` (como Guru) ou a RPC de LTV precisa fazer UNION com `ticto_transactions`.

---

**3. Eduzz não resolve/cria `unified_customer_id`**

O webhook da Guru (linha 186-194) chama `resolve_or_create_customer` para unificar o cliente. O da Eduzz **não faz isso**. Resultado: vendas Eduzz ficam sem `unified_customer_id`, quebrando completamente o vínculo com o módulo de Inteligência de Cliente e LTV.

---

**4. Deduplicação de leads inconsistente entre webhooks e RPC**

| Ponto de entrada | Dedup por | Case-sensitive? |
|---|---|---|
| webhook-lead | phone → email (exact match) | Sim |
| sync_lead_from_sale (RPC) | phone → email (exact match) | Sim |
| useImportLeads | email → phone (exact match) | Parcial (email em `in()`) |
| useLeadPurchases | unified_customers.primary_email | Sim |

Risco: um lead com email "Joao@email.com" e outro com "joao@email.com" seriam tratados como **dois leads diferentes** em todos os pontos de entrada. Apenas `useBulkLeadPurchases` faz `.toLowerCase()` no lado do cliente.

---

### MEDIO

**5. Ticto webhook não filtra status antes de sincronizar lead**

Os webhooks da Guru e Eduzz sincronizam leads para **qualquer status** (incluindo refunded, chargeback). Já o `process-import` só sincroniza se `normalizedSt === "authorized"`. Deveria haver consistência — provavelmente só sincronizar leads de vendas "authorized" para evitar criar leads a partir de chargebacks.

---

**6. Eduzz mapeia `cancelled` → `refunded` e `expired` → `refused` (inconsistente)**

O `process-import` mapeia `expired` → `canceled` e `cancelled` → `canceled`. Já o Eduzz mapeia `cancelled` → `refunded` e `expired` → `refused`. Isso cria inconsistência no campo `status` entre dados importados e dados de webhook da mesma plataforma.

---

**7. webhook-lead sobrescreve UTMs incondicionalmente em leads existentes**

No webhook-lead (linha 125-129), se um UTM é fornecido, ele sempre sobrescreve o existente. Isso pode apagar UTMs originais de tráfego pago com UTMs genéricos de formulário. A RPC `sync_lead_from_sale` usa `COALESCE(p_utm_source, leads.utm_source)` que só atualiza `utm_source` — os outros UTMs nem são atualizados na RPC.

---

**8. `useImportLeads` pode duplicar `lead_events` em reimportações**

Cada importação sempre insere novos eventos (`lead_importado`, status events) sem verificar se já existem. Reimportar a mesma planilha gera eventos duplicados na timeline.

---

### BAIXO

**9. Kanban usa `useBulkLeadPurchases(positions)` mas passa `positions` (não filtrado)**

Na linha 80 do KanbanBoard, `useBulkLeadPurchases` recebe `positions` (todos os leads do funil), não `visiblePositions` (filtrado por vendedor). Isso não causa bug visual (o map é consultado por leadId), mas busca dados de LTV para leads que o vendedor nem vê.

---

**10. `useRedistributeLeads` não limita batch de `in()` para posições**

Na linha 24, busca todas as posições do funil sem paginação. Para funis com >10k leads, isso pode falhar silenciosamente com URL muito longa (limite do Supabase para filtros `in()`).

---

**11. `useRecontactDeadlines` depende de `metadata.product_name`**

Se o lead foi criado via webhook-lead (cadastro manual), o campo `metadata.product_name` pode não existir, tornando o sistema de recontato inoperante para esses leads.

---

## FLUXOS QUE FUNCIONAM CORRETAMENTE

- **webhook-lead**: Dedup phone→email, posicionamento no stage correto via transition rules, fallback para primeiro stage. Funciona bem para cadastro manual/automação.
- **useMoveLeadStage**: Move lead + insere evento `stage_change`. Correto.
- **KanbanBoard**: Drag-and-drop, filtragem por vendedor, sorting por LTV/recontato. Funciona.
- **FunnelConfigTab**: Salva stages (upsert), rules, products, mappings. Correto.
- **WebhookConfig**: Exibe URL e token corretos para integração.
- **LeadFunnelProducts + ProductMappingConfig**: Upsert seletivo preserva IDs. Correto.
- **BaseLeadsList**: KPIs e tabela virtualizada para funis BASE. Funciona.

---

## PLANO DE CORREÇÃO (ordem de prioridade)

### Etapa 1 — Eduzz gravar em `customer_purchases` + unificar cliente
- Refatorar `eduzz-webhook` para usar `resolve_or_create_customer` e gravar em `customer_purchases` (como Guru)
- Manter gravação secundária em `ticto_transactions` para dashboards legados

### Etapa 2 — RPC `sync_lead_from_sale` posicionar no funil do produto
- Adicionar parâmetro `p_product_name` à RPC
- Dentro da RPC, consultar `lead_funnel_products` para encontrar o `lead_funnel_id` correspondente
- Posicionar o lead no funil do produto E na BASE DE LEADS

### Etapa 3 — Normalizar deduplicação case-insensitive
- Usar `LOWER()` nas queries de dedup na RPC e no webhook-lead

### Etapa 4 — Filtrar status antes de sync lead
- Só chamar `sync_lead_from_sale` quando `status === "authorized"` em todos os webhooks

### Etapa 5 — Alinhar mapa de status Eduzz com padrão canônico
- `cancelled` → `canceled`, `expired` → `canceled` (igual process-import)

---

## Seção Tecnica

```text
┌─────────────────────────────────────────────────────────────┐
│                    FLUXO ATUAL (COM GAPS)                   │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  Eduzz/Guru/Ticto webhook                                   │
│       │                                                     │
│       ├─► ticto_transactions (Eduzz/Ticto)                  │
│       │   customer_purchases (Guru)        ◄── GAP: Eduzz   │
│       │                                        não grava    │
│       │                                        aqui         │
│       └─► sync_lead_from_sale (RPC)                         │
│              │                                              │
│              └─► leads + lead_stage_positions                │
│                  no funil "BASE DE LEADS"   ◄── GAP: nunca  │
│                                                 vai pro     │
│                                                 funil do    │
│                                                 produto     │
│                                                             │
│  useLeadPurchases (LTV)                                     │
│       │                                                     │
│       └─► unified_customers → customer_purchases            │
│                                ◄── GAP: Eduzz sem           │
│                                    unified_customer_id      │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

