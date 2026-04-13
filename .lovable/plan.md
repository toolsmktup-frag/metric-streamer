

# Atualizar mapeamento de 9 potes no Step 1

## Alteracao

No arquivo `docs/sql/step1-create-product-mappings.sql`, trocar o ID do produto para a linha de "9 potes":

**De:** `0a4601b0-e352-4bc4-b597-3f9001259bca` (Pote 360 dias)
**Para:** `5be2641e-c901-45bf-b2d5-0e054f0665ff` (9 Potes Articulabem, 250 dias)

Tambem atualizar o comentario no cabecalho do arquivo para refletir a correspondencia correta.

O Step 2 nao precisa de alteracao — ele referencia leads/eventos, nao produtos.

## Resumo dos mapeamentos finais

| Nome real | Produto | ID |
|---|---|---|
| 1 pote / Pote Extra | Pote 30 dias | d8aba5bf... |
| 3 potes / Upsell 1 | Pote 90 dias | 7e620568... |
| 6 potes | Pote 180 dias | c7d1a80e... |
| 9 potes | 9 Potes Articulabem | 5be2641e... |
| 12 potes | Pote 360 dias | 0a4601b0... |
| Pote Gratis | Gratis 30 dias | a1f32030... |

