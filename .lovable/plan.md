
## Plano: Auditoria de integridade pós-migração multi-plataforma

### Objetivo
Garantir que **nenhuma venda foi perdida, duplicada ou desviada de funil** após:
- Criação de `funnel_platforms` + backfill
- Mudança de lookup nos webhooks (ticto/guru/eduzz) pra usar `funnel_platforms` com fallback em `funnels`
- Adição da coluna `platform` em `funnel_products`

### Auditoria automatizada (queries SQL read-only)

Vou rodar 7 checks no Supabase via SQL Editor — todos somente leitura, sem efeito colateral:

**Check 1 — Backfill cobriu 100% dos funis**
```sql
SELECT f.id, f.name, f.platform, f.webhook_token,
       (SELECT count(*) FROM funnel_platforms fp WHERE fp.funnel_id = f.id) as platforms_count
FROM funnels f
ORDER BY platforms_count, f.name;
```
Esperado: todo funil com pelo menos 1 linha. Se `platforms_count = 0` → backfill falhou.

**Check 2 — Tokens preservados (zero break em webhooks já cadastrados)**
```sql
SELECT f.name, f.platform, f.webhook_token as token_funnel,
       fp.webhook_token as token_platform,
       (f.webhook_token = fp.webhook_token) as match
FROM funnels f
JOIN funnel_platforms fp ON fp.funnel_id = f.id AND fp.platform = f.platform;
```
Esperado: `match = true` em todas. Se `false` → webhook configurado vai resolver pro funil errado.

**Check 3 — Sem tokens duplicados entre tabelas (colisão impossível)**
```sql
SELECT webhook_token, count(*) as ocorrencias
FROM (
  SELECT webhook_token FROM funnels
  UNION ALL
  SELECT webhook_token FROM funnel_platforms
) t
GROUP BY webhook_token HAVING count(*) > 2;
```
Esperado: vazio (cada token aparece no máx 2x — uma em cada tabela, mesmo valor).

**Check 4 — Contagem de vendas das últimas 24h não caiu**
```sql
SELECT date_trunc('hour', purchased_at) as hora,
       platform, count(*) as vendas, sum(revenue) as receita
FROM v_all_sales
WHERE purchased_at >= now() - interval '48 hours'
GROUP BY 1, 2 ORDER BY 1 DESC, 2;
```
Esperado: padrão de volume contínuo nas horas pós-deploy comparado com pré-deploy. Se zero pós-deploy → webhook quebrou.

**Check 5 — Duplicatas de transação (mesma venda processada 2x)**
```sql
SELECT platform, platform_transaction_id, count(*) as dupes
FROM (
  SELECT 'ticto' as platform, transaction_hash as platform_transaction_id FROM ticto_transactions WHERE created_at > now() - interval '7 days'
  UNION ALL
  SELECT 'guru', transaction_id FROM customer_purchases WHERE platform = 'guru' AND created_at > now() - interval '7 days'
  UNION ALL
  SELECT 'eduzz', transaction_id FROM customer_purchases WHERE platform = 'eduzz' AND created_at > now() - interval '7 days'
) t
GROUP BY platform, platform_transaction_id HAVING count(*) > 1;
```
Esperado: vazio.

**Check 6 — Vendas órfãs (sem funnel_id resolvido) pós-deploy**
```sql
SELECT platform, count(*) as orfas
FROM v_all_sales
WHERE funnel_id IS NULL AND purchased_at > now() - interval '48 hours'
GROUP BY platform;
```
Esperado: zero ou número similar a antes do deploy (vendas sem rastreamento sempre existem; aumento súbito = bug).

**Check 7 — Classificação de produtos respeitando coluna platform**
```sql
SELECT funnel_id, platform, role, count(*)
FROM funnel_products
GROUP BY 1,2,3 ORDER BY 1,2;
```
Confere se a nova coluna `platform` foi aplicada onde você cadastrou — só validação visual.

### Entregável
Rodo todos os 7 checks, monto um relatório com:
- ✅ / ❌ por check
- Para cada ❌ → linhas problemáticas + ação corretiva sugerida
- Comparativo de volume de vendas 48h antes vs 48h depois do deploy

### Como vamos rodar
Modo plano não tem acesso a SQL. Quando aprovar, eu **executo via tool `psql`** (read-only, todos `SELECT`) e te mando o relatório direto no chat. Zero risco, zero escrita.
