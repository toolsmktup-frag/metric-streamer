

## Atualizar hook para usar RPC `get_bulk_purchase_summaries`

### O que muda

**`src/hooks/useBulkLeadPurchases.ts`** — Reescrever o `queryFn` para:

1. **Remover** `fetchAllIn`, `UnifiedCustomer`, `CustomerPurchase` — não são mais necessários
2. **Chamar** `supabase.rpc('get_bulk_purchase_summaries', { p_emails: emails, p_phones: phones })` — 1 request em vez de ~180
3. **Mapear resultado** — a RPC retorna `{ match_type, match_value, total_spent, total_orders, first_purchase_date }`. Usar `leadKeyMap` para converter `match_value` → `lead_id` e construir o `Map<string, PurchaseSummary>`
4. **Adicionar** `structuralSharing: false` e `gcTime: 10 * 60 * 1000` no useQuery (Map não suporta structural sharing)

### Resultado

- 1 request HTTP em vez de ~180
- Dados consistentes, sem intermitência
- Cache estável por 10 minutos

