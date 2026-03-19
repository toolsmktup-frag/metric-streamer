

## Exportar compras detalhadas (todas as transações) para CSV

### O que muda
O export atual gera 1 linha por cliente (dados RFM agregados). O usuário quer **1 linha por compra** — cada transação individual discriminada com cliente, produto, valor, status, data, plataforma, etc.

### Implementação

**1. Novo botão "Exportar Compras Detalhadas" no RFMTab**
Ao lado do botão "Exportar CSV" existente, adicionar um segundo botão que exporta as compras individuais.

**2. Buscar dados da tabela `customer_purchases`**
A tabela `customer_purchases` contém cada transação individual com campos: `product_name`, `gross_amount`, `net_amount`, `status`, `purchased_at`, `platform`, `offer_name`, `payment_method`, `installments`, `product_type`, UTMs, etc.

Para associar ao cliente, fazer JOIN com `unified_customers` para trazer `primary_email` e `name`. Buscar paginado (blocos de 1000) para trazer todos os registros.

**3. Colunas do CSV detalhado**
- Email, Nome, Produto, Oferta, Valor Bruto (R$), Valor Líquido (R$), Status, Data da Compra, Plataforma, Método de Pagamento, Parcelas, Tipo de Produto, UTM Source, UTM Campaign

**4. Arquivo gerado**
`compras-detalhadas-{data}.csv` — potencialmente 50K+ linhas (um cliente pode ter múltiplas compras).

### Detalhes técnicos
- Busca paginada com `.range()` em loop para superar o limite de 1000 linhas do Supabase
- JOIN: `customer_purchases` + `unified_customers` via `unified_customer_id` para trazer email/nome
- Usa o mesmo `downloadCsv()` já existente em `src/lib/exportCsv.ts`
- Botão com estado de loading enquanto busca todos os dados (pode levar alguns segundos)
- Arquivo: `src/components/intelligence/RFMTab.tsx` (novo botão + função de export detalhado)

