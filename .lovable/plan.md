

## Correção: Export "Compras Detalhadas" retornando erro 400

### Problema
O botão exporta mas gera arquivo vazio porque a query usa `name` mas a coluna real é `full_name` na tabela `unified_customers`.

Erro do Supabase: `column unified_customers_1.name does not exist`

### Correção
**Arquivo:** `src/components/intelligence/RFMTab.tsx`, linha 92

1. Na query do select, trocar `name` por `full_name`:
   - De: `unified_customers!inner(primary_email, name)`
   - Para: `unified_customers!inner(primary_email, full_name)`

2. Na linha 103, trocar a referência:
   - De: `customer?.name`
   - Para: `customer?.full_name`

Duas linhas de mudança, corrige o erro completamente.

