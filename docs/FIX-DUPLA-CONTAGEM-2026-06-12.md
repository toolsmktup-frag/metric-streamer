# Fix: dupla contagem Ticto/Eduzz nas análises (RFM, Cohort, Journeys, Cross-sell)

**Data:** 2026-06-12 · **Migration:** `20260612200000_fix_dedup_ticto_eduzz_mirror.sql` · **Status:** ✅ aplicada em prod

## Causa raiz

O espelhamento em `ticto_transactions` é **intencional**: `process-import` (CSV Ticto **e** Eduzz)
e `eduzz-webhook` gravam cada venda nas **duas** tabelas — `customer_purchases` (fonte unificada)
e `ticto_transactions` ("dashboards legados") — com `cp.platform_transaction_id = tt.transaction_hash`
por construção. A view `v_all_sales` trata isso (branch `customer_purchases` filtrado a `platform = 'guru'`),
mas as funções de análise que fazem `UNION ALL` das duas tabelas não:

| Função | Dedup antes do fix | Efeito |
|---|---|---|
| `fn_cohort_analysis` | nenhum | tudo (ticto + eduzz) contado 2× |
| `fn_customer_journeys` | nenhum | tudo contado 2× |
| `fn_rfm_customers` | `platform='ticto'` + `order_id` | 50.280 compras eduzz contadas 2× |
| `fn_crosssell_matrix` | `platform='ticto'` + `order_id` | idem |
| `fn_rfm_segment_summary` | deriva de `fn_rfm_customers` | herdava o erro |

A chave antiga só casava compras rotuladas `platform='ticto'` — as 50.280 linhas Eduzz
("Guia de Tinturas" etc.) escapavam do `NOT EXISTS`. Era esse o "12.612 ticto em
customer_purchases vs 63.970 em ticto_transactions" do achado da auditoria de 11/06.

## Chave nova

```sql
AND NOT EXISTS (
  SELECT 1 FROM public.customer_purchases cp_exists
  WHERE cp_exists.platform IN ('ticto', 'eduzz')
    AND cp_exists.platform_transaction_id = tt.transaction_hash
)
```

- Independe do rótulo de plataforma (pega os espelhos eduzz).
- Granularidade de **transação**: a chave antiga (por `order_id`) suprimia cobranças de assinatura
  ainda não importadas (47 em prod, ex. Clube Secreto das Plantas) — agora contam corretamente.
- Usa o índice único `(platform, platform_transaction_id)` do upsert.

## Validação em prod (2026-06-12)

Branch `ticto_transactions` autorizado = 63.997 linhas: chave antiga casava 12.652;
chave nova casa **62.802** (50.197 espelhos eduzz param de duplicar; 1.195 linhas
tt-only — webhook Ticto não importado — continuam contando).

| Métrica | Antes | Depois | Δ |
|---|---|---|---|
| RFM clientes | 37.360 | 37.254 | −106 |
| RFM pedidos | 89.055 | **47.872** | −46% |
| RFM receita | R$ 8.472.830 | **R$ 5.617.926** | −34% |
| Cohort clientes (Σ) | 47.918 | **37.254** | −10.664 fantasmas |
| Cohort receita 1º mês | R$ 6.612.771 | **R$ 3.475.340** | −47% |

Consistência: Cohort e RFM agora batem nos mesmos 37.254 clientes (antes o Cohort criava
clientes-fantasma `email:` a partir das linhas espelhadas). Sanity check no maior comprador
eduzz: 41 pedidos eduzz + 8 guru = 49 pedidos / R$ 6.935,70 — exatamente o que o RFM reporta.

## Hipótese descartada: emails com maiúscula

A suspeita de `.in('primary_email', ...)` case-sensitive (recompra ~142 vs ~477) **não se
confirmou**: zero emails com maiúscula em `unified_customers.primary_email` e em
`customer_identity_links` (a RPC `resolve_or_create_customer` normaliza na escrita).
Achado paralelo: **145 grupos de clientes duplicados** com o mesmo email (fragmentação de
identidade) — candidato a frente futura de merge de identidades.

## Observações

- A RPC vive no banco; este arquivo e a migration são referência. Republish da Lovable não afeta.
- Artefato de dados notado (sem ação): assinaturas importadas por CSV têm todas as cobranças
  com a mesma `purchased_at` (data do pedido) — o RFM agrupa por pedido, então não infla frequência.
