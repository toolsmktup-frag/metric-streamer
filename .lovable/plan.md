

# Plano: Normalização e Unificação de Dados

## Resumo

Corrigir a fragmentação de dados do sistema em 4 fases: normalizar status em todos os pontos de entrada, adicionar sync de leads nas importações, expandir a view `v_all_sales` para todas as plataformas, e migrar o frontend para usar essa view.

---

## Fase 1 — Normalização de Status nos Importadores

**Problema**: `import-ticto-csv` e `process-import` passam status cru direto pro banco (ex: "Autorizado", "paid") sem normalizar.

**Ação**:
- `supabase/functions/import-ticto-csv/index.ts` — Adicionar mapa de status canônico (mesmo do ticto-webhook) antes do upsert. Status como "Autorizado"→"authorized", "Pix Gerado"→"pending", etc.
- `supabase/functions/process-import/index.ts` — Adicionar normalização de status (linha 86: `status: record.status || 'authorized'` → usar mapa). Também normalizar o status na escrita em `ticto_transactions` (linha 116).

**Mapa canônico** (aplicado em ambos):
```
paid/approved/authorized/sale_approved → authorized
pending/waiting_payment/pix_created/bank_slip_created/unpaid → pending
refunded/refund/sale_refunded → refunded
chargeback/sale_chargeback → chargeback
canceled/cancelled/expired → canceled
refused/recusado → refused
```

## Fase 2 — Sync de Leads nas Importações

**Problema**: Vendas importadas via CSV nunca criam leads no CRM Kanban.

**Ação**:
- `supabase/functions/import-ticto-csv/index.ts` — Após o upsert em `ticto_transactions`, chamar lógica de `syncLeadFromSale` para cada registro (inline, mesmo padrão dos webhooks).
- `supabase/functions/process-import/index.ts` — Após insert em `customer_purchases`, chamar `syncLeadFromSale` para cada registro inserido com sucesso.

A função `syncLeadFromSale` será copiada inline em cada arquivo (mesmo padrão já usado nos 3 webhooks — não é possível compartilhar código entre Edge Functions do Supabase sem import maps).

## Fase 3 — Expandir `v_all_sales` para Todas as Plataformas

**Problema**: A view filtra `WHERE platform = 'guru'` em `customer_purchases`, excluindo Hotmart e outros.

**Ação**: Nova migration SQL que recria a view **removendo o filtro `WHERE platform = 'guru'`**, incluindo todas as plataformas de `customer_purchases`.

Também adicionar as colunas `customer_name` e `customer_email` da tabela `customer_purchases` (usando join em `unified_customers` se necessário, ou campos diretos se existirem).

**Você precisará rodar essa migration no Supabase.**

## Fase 4 — Migrar Frontend para `v_all_sales`

**Problema**: 6 arquivos consultam `ticto_transactions` e `customer_purchases` diretamente com lógicas diferentes.

**Ação** — Migrar para usar `v_all_sales` (ou `useAllSales` hook):

| Arquivo | Mudança |
|---|---|
| `src/hooks/useTictoData.ts` | Trocar `ticto_transactions` → `v_all_sales`, ajustar campo `paid_amount/100` → `revenue` |
| `src/pages/KpiGeral.tsx` | Trocar query direta `ticto_transactions` → `v_all_sales` |
| `src/pages/LeadsList.tsx` | Trocar `ticto_transactions` → `v_all_sales` |
| `src/pages/CrmAnalytics.tsx` | Remover as 2 queries separadas, usar 1 query em `v_all_sales` |
| `src/pages/Ecommerce.tsx` | Remover as 2 queries separadas, usar 1 query em `v_all_sales` |
| `src/pages/Resumo.tsx` | Trocar queries de telefone para `v_all_sales` (ou manter se precisa de campos não presentes na view) |

---

## Sequência de Execução

1. Editar `import-ticto-csv/index.ts` e `process-import/index.ts` (normalização + sync)
2. Criar migration SQL para `v_all_sales` expandida → **você roda no Supabase**
3. Migrar os 6 arquivos frontend para `v_all_sales`

## Sobre o Reset de Dados

Após essas mudanças, recomendo limpar as tabelas (`lead_events` → `lead_stage_positions` → `leads` → `meta_sync_log` → `ticto_transactions` → `customer_purchases`) e re-importar do zero. Mas isso é uma decisão sua — posso preparar o script de limpeza depois.

