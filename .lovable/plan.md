

## Roteamento Multi-Funil por Produto

### Problema
A RPC `sync_lead_from_sale` usa `LIMIT 1` no match de produto — se "Guia de Tinturas" está configurado em 2+ funis (ex: "Recontato 90d" e "Infoprodutos Geral"), apenas um recebe o lead.

### Solução
Substituir o bloco de match único por um loop que posiciona o lead em **todos** os funis que fazem match com o produto.

### Etapas

**1. Migration SQL — atualizar `sync_lead_from_sale` (v4)**

Reescrever o bloco 6 da função: trocar as duas queries com `LIMIT 1` + `IF` por um `FOR ... LOOP` que itera sobre todos os funis com match:

```text
FOR v_prod_funnel_id IN
  SELECT DISTINCT lf.id
  FROM lead_product_mappings lpm
  JOIN lead_funnels lf ON lf.id = lpm.lead_funnel_id
  WHERE ... LOWER match exato ...
  UNION
  SELECT DISTINCT lfp.lead_funnel_id
  FROM lead_funnel_products lfp
  JOIN lead_funnels lf ON lf.id = lfp.lead_funnel_id
  WHERE ... ILIKE match fragmento ...
LOOP
  -- Log lead_event no funil
  -- Posicionar no primeiro stage (ON CONFLICT DO NOTHING)
END LOOP;
```

A constraint `UNIQUE (lead_id, funnel_id)` em `lead_stage_positions` já existe, então `ON CONFLICT DO NOTHING` protege contra duplicatas.

**2. Atualizar documentação**

Sincronizar `docs/rpc-sync-lead-from-sale.sql` com a nova versão v4.

### O que NÃO muda
- Frontend — a UI de "Produtos & Recontato" já permite o mesmo produto em múltiplos funis
- Automações WhatsApp — continuam disparando pelo pipeline independente do `wz-receiver`
- Funis com produto único — comportamento idêntico ao atual

### Resultado
Uma venda de "Guia de Tinturas" posiciona o lead simultaneamente em todos os funis que têm esse produto configurado, cada um com seu próprio ciclo de recontato e gestão de etapas independente.

