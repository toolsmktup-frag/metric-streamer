

# Plano: Corrigir roteamento de produtos para o funil RECOMPRA - POTES

## Problema confirmado

A RPC `sync_lead_from_sale` recebe o `product_name` do webhook (ex: `"3 potes ArticulaBEM – Soulnaturi (VSL)"`) e tenta encontrar o funil correto comparando com `lead_funnel_products.product_name_contains` via ILIKE. Os fragmentos configurados atualmente (ex: `"Articulabem Pote 30 dias"`) **não existem** nos nomes reais, então o match falha e os eventos caem apenas na BASE DE LEADS.

A tabela `lead_product_mappings` para este funil está **vazia** — sem mapeamento exato.

## Nomes reais detectados (11 variantes)

| Produto (nome real do webhook) | Ocorrências |
|---|---|
| 3 potes ArticulaBEM – Soulnaturi (VSL) | 372 |
| 3 potes ArticulaBEM – Soulnaturi | 211 |
| Pote Grátis ArticulaBEM – Soulnaturi | 164 |
| 1 pote ArticulaBEM – Soulnaturi | 152 |
| 6 potes ArticulaBEM – Soulnaturi | 116 |
| 1 Pote Grátis do Articulabem | 70 |
| 9 potes ArticulaBEM – Soulnaturi | 52 |
| 12 potes ArticulaBEM – Soulnaturi | 34 |
| Upsell 1 – 3 potes ArticulaBEM – Soulnaturi | 4 |
| Pote Extra ArticulaBEM – Soulnaturi (Bump do pote grátis) | 2 |
| 3 Potes Articulabem | 1 |

## Solução em 2 passos

### Passo 1 — Criar mapeamentos via SQL

Gerar um script SQL para inserir os 11 nomes reais na tabela `lead_product_mappings`, vinculando cada um ao `lead_funnel_product` correto do funil RECOMPRA - POTES (`19f75912-295e-4c67-acad-275ce6849c5c`).

**Você precisará me informar**: qual dos seus produtos configurados (IDs da query anterior) corresponde a cada nome. Por exemplo:
- "1 pote" e "Pote Grátis" → produto de 30 dias?
- "3 potes" → produto de 90 dias?
- "6 potes" → produto de 180 dias?
- etc.

Ou, se preferir, posso gerar o SQL assumindo uma correspondência lógica baseada na quantidade de potes.

### Passo 2 — Reprocessar eventos antigos

Gerar um script SQL que:
1. Busca todos os `lead_events` na BASE DE LEADS com `product_name ILIKE '%articulabem%'`
2. Para cada um, aplica o mapeamento correto e posiciona o lead no funil RECOMPRA - POTES
3. Aplica as `stage_transition_rules` para mover o lead para a etapa correta (Comprou, Pix Gerado, Cancelado, etc.)

## O que preciso de você

Me envie o resultado da query dos produtos configurados (a segunda query que rodou — `lead_funnel_products`) para eu poder fazer a correspondência nome ↔ produto. Ou me diga a lógica (ex: "1 pote = 30 dias, 3 potes = 90 dias...").

