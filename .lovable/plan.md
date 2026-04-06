
## Plano: Match por Product ID externo no Stock Deductor

### Problema
Hoje o match é feito por `offer_name` (nome do produto), que é frágil — qualquer variação de caixa/espaço quebra. O `product_id` da plataforma (ex: `1775323008`) é fixo e confiável.

### Alterações

1. **Migration**: Adicionar coluna `external_product_id` (text) em `product_offer_mappings`
2. **stock-deductor**: Priorizar match por `external_product_id`, fallback para `offer_name`
3. **UI do E-commerce**: Adicionar campo "ID do Produto na Plataforma" no formulário de mapeamento de ofertas

### Fluxo após a mudança
- Webhook envia `product_id: "1775323008"` + `product_name: "3 potes ArticulaBEM"`
- stock-deductor busca primeiro por `external_product_id = "1775323008"` ✅
- Se não achar, tenta por `offer_name` (fallback)

### Resultado
Cadastrar apenas o ID do produto (que você já tem) e a quantidade de potes — sem se preocupar com variações de nome.
