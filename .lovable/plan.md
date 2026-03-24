

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

## Fase 3 — Expandir `v_all_sales` para Todas as Plataformas

**Problema**: A view filtra `WHERE platform = 'guru'` em `customer_purchases`, excluindo Hotmart e outros.

**Ação**: Nova migration SQL que recria a view **removendo o filtro `WHERE platform = 'guru'`**, incluindo todas as plataformas de `customer_purchases`.

## Fase 4 — Migrar Frontend para `v_all_sales`

**Problema**: 6 arquivos consultam `ticto_transactions` e `customer_purchases` diretamente com lógicas diferentes.

**Ação** — Migrar para usar `v_all_sales` (ou `useAllSales` hook).

---

## Sequência de Execução

1. ✅ Centralizar syncLeadFromSale em RPC
2. **Rodar `docs/rpc-sync-lead-from-sale.sql` no Supabase**
3. Criar migration SQL para `v_all_sales` expandida
4. Migrar os 6 arquivos frontend para `v_all_sales`
