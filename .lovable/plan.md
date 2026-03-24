

# Plano: Normalização e Unificação de Dados

## Resumo

Corrigir a fragmentação de dados do sistema em 4 fases: normalizar status em todos os pontos de entrada, adicionar sync de leads nas importações, expandir a view `v_all_sales` para todas as plataformas, e migrar o frontend para usar essa view.

---

## ✅ Centralização do syncLeadFromSale (CONCLUÍDO)

A lógica duplicada em 5 Edge Functions foi substituída por uma stored procedure PostgreSQL `sync_lead_from_sale`.

**Arquivo SQL**: `docs/rpc-sync-lead-from-sale.sql` — rodar no Supabase antes de deployar.

**Edge Functions refatoradas**: ticto-webhook, guru-webhook, eduzz-webhook, import-ticto-csv, process-import.

---

## Fase 1 — Normalização de Status nos Importadores ✅

Já implementado nos importadores com mapa canônico.

## Fase 2 — Sync de Leads nas Importações ✅

Já implementado — agora via RPC centralizada.

## ✅ Auditoria Completa do CRM — Correções Aplicadas

### Etapa 1 ✅ — Eduzz gravar em `customer_purchases` + unificar cliente
- Eduzz agora grava em `customer_purchases` (como Guru) + mantém `ticto_transactions` para legado
- Chama `resolve_or_create_customer` para unificar identidade

### Etapa 2 ✅ — RPC posicionar no funil do produto
- `sync_lead_from_sale` agora recebe `p_product_name`
- Busca funil via `lead_funnel_products` e `lead_product_mappings`
- Posiciona lead na BASE DE LEADS **e** no funil do produto

### Etapa 3 ✅ — Dedup case-insensitive
- RPC usa `LOWER()` na busca por email
- webhook-lead usa `.ilike()` na busca por email

### Etapa 4 ✅ — Filtrar status antes de sync lead
- Todos os webhooks (Eduzz, Guru, Ticto) só chamam `sync_lead_from_sale` quando `status === "authorized"`
- process-import já fazia isso

### Etapa 5 ✅ — Alinhar mapa de status
- Eduzz: `cancelled` → `canceled`, `expired` → `canceled` (antes era `refunded`/`refused`)
- Ticto: `pix_expired`/`bank_slip_expired`/`expired` → `canceled` (antes era `expired`)
- UTMs no webhook-lead: COALESCE (não sobrescreve UTMs originais)

---

## Fase 3 — Expandir `v_all_sales` para Todas as Plataformas

**Problema**: A view filtra `WHERE platform = 'guru'` em `customer_purchases`, excluindo Hotmart e outros.

**Ação**: Nova migration SQL que recria a view **removendo o filtro `WHERE platform = 'guru'`**, incluindo todas as plataformas de `customer_purchases`.

## Fase 4 — Migrar Frontend para `v_all_sales`

**Problema**: 6 arquivos consultam `ticto_transactions` e `customer_purchases` diretamente com lógicas diferentes.

**Ação** — Migrar para usar `v_all_sales` (ou `useAllSales` hook).

---

## Sequência de Execução

1. ✅ Centralizar syncLeadFromSale em RPC
2. ✅ Aplicar correções da auditoria completa
3. **Rodar `docs/rpc-sync-lead-from-sale.sql` no Supabase** (v2 com p_product_name)
4. **Deploy das 5 Edge Functions** (eduzz, guru, ticto, process-import, webhook-lead)
5. Criar migration SQL para `v_all_sales` expandida
6. Migrar os 6 arquivos frontend para `v_all_sales`
