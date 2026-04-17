
A coluna real em `customer_purchases` provavelmente é `platform_transaction_id` (padrão do projeto, ver memória `architecture/lead-import/deduplication-logic`). Vou ajustar o SQL e mandar pronto pra colar.

## SQL corrigido (copia tudo e cola no SQL Editor)

```sql
-- Check 1: Backfill cobertura
SELECT 'check1_backfill' as check, f.name, f.platform,
       (SELECT count(*) FROM funnel_platforms fp WHERE fp.funnel_id = f.id) as platforms_count
FROM funnels f ORDER BY f.name;

-- Check 2: Tokens preservados
SELECT 'check2_tokens' as check, f.name, f.platform,
       (f.webhook_token = fp.webhook_token) as token_match
FROM funnels f
JOIN funnel_platforms fp ON fp.funnel_id = f.id AND fp.platform = f.platform;

-- Check 3: Colisão de tokens
SELECT 'check3_collisions' as check, webhook_token, count(*) as ocorrencias
FROM (
  SELECT webhook_token FROM funnels
  UNION ALL
  SELECT webhook_token FROM funnel_platforms
) t
GROUP BY webhook_token HAVING count(*) > 2;

-- Check 4: Volume de vendas 48h
SELECT 'check4_volume' as check, date_trunc('hour', purchased_at) as hora,
       platform, count(*) as vendas, sum(revenue) as receita
FROM v_all_sales
WHERE purchased_at >= now() - interval '48 hours'
GROUP BY 1,2,3 ORDER BY 2 DESC, 3;

-- Check 5: Duplicatas (usa platform_transaction_id, nome correto da coluna)
SELECT 'check5_dupes' as check, platform, platform_transaction_id, count(*) as dupes
FROM (
  SELECT 'ticto'::text as platform, transaction_hash as platform_transaction_id
    FROM ticto_transactions WHERE created_at > now() - interval '7 days'
  UNION ALL
  SELECT platform, platform_transaction_id
    FROM customer_purchases
    WHERE platform IN ('guru','eduzz') AND created_at > now() - interval '7 days'
) t
WHERE platform_transaction_id IS NOT NULL
GROUP BY 2,3 HAVING count(*) > 1
LIMIT 50;

-- Check 6: Vendas órfãs
SELECT 'check6_orfas' as check, platform, count(*) as orfas
FROM v_all_sales
WHERE funnel_id IS NULL AND purchased_at > now() - interval '48 hours'
GROUP BY platform;

-- Check 7: Produtos por plataforma
SELECT 'check7_products' as check, funnel_id, platform, role, count(*)
FROM funnel_products
GROUP BY 1,2,3,4 ORDER BY 2,3;
```

Roda tudo de uma vez (o SQL Editor mostra cada SELECT em tabela separada). Me cola aqui o resultado dos 7 checks (ou print) e eu monto o relatório de integridade ✅/❌ com as ações corretivas se algo aparecer torto.

### Caso a coluna não seja `platform_transaction_id`
Se ainda der erro de coluna no Check 5, roda só isso e me manda a saída:
```sql
SELECT column_name FROM information_schema.columns
WHERE table_schema='public' AND table_name='customer_purchases'
  AND column_name ILIKE '%transaction%';
```
Aí ajusto na hora.
