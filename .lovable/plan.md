

## Plano: Heranca de UTM para upsells sem rastreamento

### Problema

Quando o cliente compra o produto principal (ex: 3 potes ArticulaBEM) via ads, os UTMs sao capturados normalmente. Mas ao comprar o upsell (9 potes), a Guru nao repassa os UTMs porque o cliente pode ter saido e voltado ao checkout. Resultado: o upsell aparece como organico no sistema.

### Solucao

Adicionar uma etapa no `guru-webhook/index.ts` (e tambem no `ticto-webhook/index.ts`) que, **quando os UTMs estao vazios**, busca a compra mais recente do mesmo cliente nas ultimas 24h e herda os UTMs dela.

### Logica (pseudo-codigo)

```text
Se utmSource == null E (customer.email OU customer.phone):
  1. Buscar em customer_purchases:
     - mesmo email OU mesmo telefone
     - status = 'authorized'
     - purchased_at >= NOW() - 24h
     - utm_source IS NOT NULL
     - ORDER BY purchased_at DESC LIMIT 1
  2. Se encontrou, copiar: utm_source, utm_campaign, utm_medium, 
     utm_content, utm_term, meta_campaign_id, meta_adset_id, meta_ad_id
  3. Logar: "[guru-webhook] UTM inherited from purchase {id}"
```

### Alteracoes

**1. `supabase/functions/guru-webhook/index.ts`** (~15 linhas adicionadas)

Apos a linha 175 (onde metaAdId e definido), antes de montar o `record`:
- Se `utmSource` e null, executar query de heranca
- Sobrescrever as variaveis de UTM e meta IDs com os valores herdados

**2. `supabase/functions/ticto-webhook/index.ts`** (mesma logica)

Aplicar o mesmo pattern apos o parsing de UTMs, para cobrir vendas da Ticto tambem.

### Seguranca

- Janela de 24h evita atribuicoes falsas
- Match por email (case-insensitive) OU telefone normalizado
- So herda se a compra anterior tem `utm_source IS NOT NULL`
- Nao sobrescreve UTMs que ja existem (so quando todos sao null)

### Resultado

A venda dos 9 potes da Maria de Lourdes seria automaticamente atribuida a mesma campanha dos 3 potes, porque ela comprou com o mesmo email (`mariacroche2018@gmail.com`) dentro de 24h.

