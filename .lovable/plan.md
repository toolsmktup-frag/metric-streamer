

## Corrigir view `v_all_sales` para incluir dados Guru

### Problema
O Resumo Geral mostra menos dados que a Inteligência de Cliente porque `v_all_sales` consulta apenas `ticto_transactions`, enquanto a Inteligência consulta também `customer_purchases` (Guru).

### Solução
Atualizar a view `v_all_sales` via migration para fazer `UNION ALL` de:
1. `customer_purchases` (platform != 'ticto') -- dados Guru
2. `ticto_transactions` -- dados Ticto brutos com UTMs e Meta IDs

### O que muda
- **Migration SQL**: `CREATE OR REPLACE VIEW v_all_sales` com os dois branches
- **Frontend**: Nenhuma alteração necessária. O hook `useAllSales` já consome `v_all_sales` com as mesmas colunas

### O que se mantém
- Todas as vendas Ticto com UTMs, meta_campaign_id, meta_adset_id, meta_ad_id
- Cruzamento com campanhas Meta Ads funciona igual
- Dados Guru entram como vendas orgânicas (sem meta IDs)

### SQL da migration

```sql
CREATE OR REPLACE VIEW public.v_all_sales AS
  -- Guru (customer_purchases excluindo ticto para não duplicar)
  SELECT
    cp.id::text AS id,
    cp.platform::text AS platform,
    NULL::text AS funnel_id,
    cp.status,
    cp.purchased_at::timestamptz AS purchased_at,
    cp.gross_amount::numeric AS revenue,
    cp.product_name,
    cp.offer_name,
    cp.payment_method,
    NULL::text AS customer_name,
    NULL::text AS customer_email,
    NULL::text AS meta_campaign_id,
    NULL::text AS meta_adset_id,
    NULL::text AS meta_ad_id,
    NULL::text AS meta_campaign_name,
    NULL::text AS meta_adset_name,
    NULL::text AS meta_ad_name,
    cp.utm_source,
    cp.utm_campaign,
    cp.utm_medium,
    cp.utm_content,
    false AS is_paid_traffic
  FROM public.customer_purchases cp
  WHERE cp.platform <> 'ticto'

  UNION ALL

  -- Ticto (fonte bruta com UTMs e Meta IDs)
  SELECT
    id, 'ticto'::text AS platform, funnel_id, status,
    order_date::timestamptz AS purchased_at,
    (paid_amount / 100.0)::numeric AS revenue,
    product_name, offer_name, payment_method,
    customer_name, customer_email,
    meta_campaign_id, meta_adset_id, meta_ad_id,
    meta_campaign_name, meta_adset_name, meta_ad_name,
    utm_source, utm_campaign, utm_medium, utm_content,
    is_paid_traffic
  FROM public.ticto_transactions;
```

