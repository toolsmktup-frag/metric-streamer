

## Problema

O botão "Exportar Clientes" está no **Dashboard de Leads**, mas faz mais sentido estar na página de **Vendas (Resumo)**, já que os dados vêm das tabelas de vendas (`ticto_transactions`, `customer_purchases`).

## Plano

### 1. Mover export para a página Resumo (`src/pages/Resumo.tsx`)

- Adicionar botão **"Exportar Vendas"** no header da página Resumo (ao lado do DateRangePicker/Sync)
- Exportar **todos os dados da venda** (não apenas nome/email/telefone):
  - Nome, Email, Telefone
  - Produto, Oferta, Valor, Status, Método de pagamento
  - Data da compra, Plataforma
  - UTM Source, Medium, Campaign
- Usar os dados já carregados via `useAllSales()` (view `v_all_sales`) que já contém vendas de todas as plataformas
- Gerar `.xlsx` com a lib `xlsx` (já instalada)

### 2. Remover export do LeadsDashboard (`src/pages/LeadsDashboard.tsx`)

- Remover o botão "Exportar Clientes" e toda a lógica `handleExport` + estado `exporting`
- Manter apenas o botão "Sincronizar Base"

Assim o fluxo fica: **Resumo (Vendas) → Exportar Vendas → Arquivo .xlsx com todos os dados → Importar na BASE DE LEADS se quiser.**

