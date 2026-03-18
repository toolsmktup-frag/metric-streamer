

## Plano: "Base de Leads" como hub central

### Conceito

Transformar a tabela `leads` na **base central de contatos** do sistema. Toda venda (Ticto, Guru, Eduzz) automaticamente cria/atualiza um lead. Um funil especial "BASE DE LEADS" é criado automaticamente como ponto de entrada universal.

### O que muda

**1. Modificar os 3 webhooks de vendas para criar leads**

Em `ticto-webhook`, `guru-webhook` e `eduzz-webhook`, após salvar a transação, adicionar:
- Busca lead por phone → email (deduplicação, mesma lógica do `webhook-lead`)
- Se não existe, cria em `leads`
- Registra `lead_event` com `event_name = 'purchase'` e metadata (produto, valor, status)
- Posiciona o lead no funil "BASE DE LEADS" (primeiro estágio) se ainda não estiver

**2. Criar Edge Function `sync-leads-from-sales` (backfill)**

Nova function que varre `ticto_transactions` e `customer_purchases` existentes e:
- Cria leads retroativamente (deduplica por email/phone)
- Registra eventos de compra históricos em `lead_events`
- Posiciona todos no funil "BASE DE LEADS"
- Executada uma única vez via botão no frontend

**3. Criar funil "BASE DE LEADS" automático**

- Ao rodar o backfill, cria (se não existe) um `lead_funnel` chamado "BASE DE LEADS" com estágios:
  - `Novo` → `Comprador` → `Recorrente` → `VIP`
- As regras de transição movem automaticamente:
  - Evento `purchase` com 1ª compra → "Comprador"
  - Evento `purchase` com 2ª+ compra → "Recorrente"

**4. Atualizar frontend - coluna "Total Gasto" na lista de leads**

Em `LeadsList.tsx`, adicionar consulta a `customer_purchases` pelo email do lead para mostrar valor total gasto.

### Arquivos alterados

| Arquivo | Ação |
|---|---|
| `supabase/functions/ticto-webhook/index.ts` | Adicionar bloco de criação de lead + evento após upsert |
| `supabase/functions/guru-webhook/index.ts` | Idem |
| `supabase/functions/eduzz-webhook/index.ts` | Idem |
| `supabase/functions/sync-leads-from-sales/index.ts` | **Nova** - backfill histórico |
| `supabase/config.toml` | Registrar `sync-leads-from-sales` |
| `src/pages/LeadsList.tsx` | Coluna "Total Gasto" |
| `src/pages/LeadsDashboard.tsx` | Botão "Sincronizar Base" para invocar o backfill |

### Fluxo resultante

```text
Ticto/Guru/Eduzz webhook
  → salva transação (como hoje)
  → cria/atualiza lead (NOVO)
  → registra lead_event "purchase" (NOVO)
  → posiciona no funil "BASE DE LEADS" (NOVO)

Todas as páginas de Leads se populam automaticamente.
```

### Sem alterações no schema

Tudo usa tabelas existentes: `leads`, `lead_events`, `lead_stage_positions`, `lead_funnels`, `lead_funnel_stages`.

