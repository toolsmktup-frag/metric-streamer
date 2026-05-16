# Conferir se webhooks da Guru estão vindo de contas diferentes

Sem alteração de código. Só queries SQL pra rodar no Supabase Dashboard → SQL Editor e analisar o tráfego que já chegou.

## 1. Ver últimos webhooks brutos da Guru (com identificador do produtor)

```sql
SELECT
  created_at,
  payload->'producer'->>'id'          AS producer_id,
  payload->'producer'->>'name'        AS producer_name,
  payload->'producer'->>'document'    AS producer_doc,
  payload->>'event'                   AS event,
  payload->'product'->>'name'         AS product_name
FROM public.webhook_audit_log
WHERE source = 'guru'
  AND created_at > now() - interval '7 days'
ORDER BY created_at DESC
LIMIT 50;
```

Se `producer_id` / `producer_doc` aparecer **com valores diferentes** entre as linhas → tá entrando webhook de mais de uma conta Guru. Se só aparecer um valor → ainda é uma conta só.

## 2. Contagem agrupada por conta Guru (últimos 30 dias)

```sql
SELECT
  payload->'producer'->>'id'   AS producer_id,
  payload->'producer'->>'name' AS producer_name,
  count(*)                     AS webhooks
FROM public.webhook_audit_log
WHERE source = 'guru'
  AND created_at > now() - interval '30 days'
GROUP BY 1, 2
ORDER BY webhooks DESC;
```

## 3. Cruzar com `customer_purchases` (vendas já processadas)

```sql
SELECT
  funnel_id,
  count(*) AS vendas,
  min(purchased_at) AS primeira,
  max(purchased_at) AS ultima
FROM public.customer_purchases
WHERE platform = 'guru'
  AND purchased_at > now() - interval '7 days'
GROUP BY funnel_id
ORDER BY vendas DESC;
```

Confirma que as vendas das duas contas Guru estão caindo no mesmo `funnel_id` (Articulabem - 1).

## Se as queries acima não retornarem nada

Os nomes dos campos podem variar (`producer` vs `seller` vs `account_id`). Nesse caso me manda 1 print de uma linha bruta do `webhook_audit_log` (campo `payload` inteiro) que eu ajusto as queries.
