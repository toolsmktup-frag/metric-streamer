

# Correção da RPC sync_lead_from_sale — Match de Produto

## Problema encontrado

A RPC v2 tem dois bugs no bloco de roteamento por produto (seção 6):

1. Referencia `lfp.name` — coluna que não existe. A coluna correta é `lfp.product_name_contains`
2. Usa match exato (`LOWER(x) = LOWER(y)`) em vez de match por fragmento (`ILIKE`), ignorando o padrão já estabelecido no sistema

Isso significa que o roteamento por produto **não funciona** mesmo após o deploy da v2.

## Correção

Alterar o bloco da seção 6 no arquivo `docs/rpc-sync-lead-from-sale.sql`:

### Lógica corrigida (2 tentativas, em ordem):

**Tentativa 1 — `lead_product_mappings` (match exato, case-insensitive)**
Usa o mapeamento manual da UI onde o usuário vinculou o nome raw ao produto catalogado.

**Tentativa 2 — `lead_funnel_products` (match por fragmento via ILIKE)**
Usa `p_product_name ILIKE '%' || lfp.product_name_contains || '%'` com `ORDER BY length(lfp.product_name_contains) DESC` para priorizar o match mais específico. Mesmo padrão da RPC `resolve_funnel_for_product` que já existe.

### Mudanças no SQL:

```sql
-- Tentativa 1: match exato via lead_product_mappings
SELECT lf.id INTO v_prod_funnel_id
FROM lead_product_mappings lpm
JOIN lead_funnels lf ON lf.id = lpm.lead_funnel_id
WHERE lf.organization_id = v_org_id
  AND LOWER(lpm.raw_product_name) = LOWER(p_product_name)
  AND lf.is_active = true
LIMIT 1;

-- Tentativa 2: match por fragmento via lead_funnel_products
IF v_prod_funnel_id IS NULL THEN
  SELECT lfp.lead_funnel_id INTO v_prod_funnel_id
  FROM lead_funnel_products lfp
  JOIN lead_funnels lf ON lf.id = lfp.lead_funnel_id
  WHERE lf.organization_id = v_org_id
    AND p_product_name ILIKE '%' || lfp.product_name_contains || '%'
    AND lf.is_active = true
  ORDER BY length(lfp.product_name_contains) DESC
  LIMIT 1;
END IF;
```

## Arquivo modificado

- `docs/rpc-sync-lead-from-sale.sql` — corrigir seção 6 (linhas 135-155)

## Pós-deploy

Após atualizar o arquivo, o SQL precisa ser re-executado no Supabase Dashboard para substituir a RPC v2 com a versão corrigida.

