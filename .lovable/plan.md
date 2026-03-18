

## Plano: Exportar Vendas → Importar como Leads

O sync automático (`sync-leads-from-sales`) depende de `unified_customers` + `customer_purchases` com filtro de status, e algo na cadeia está retornando zero (possivelmente dados sem `unified_customer_id` ou status diferente do esperado). Em vez de continuar debugando, vamos criar um caminho direto.

### Abordagem

Criar um botão **"Exportar Clientes para Leads"** no dashboard de leads que:

1. Busca clientes únicos diretamente de `ticto_transactions` (status `authorized`) + `customer_purchases` (status `authorized`)
2. Deduplica por email (case-insensitive)
3. Gera um arquivo `.xlsx` com as colunas: Nome, Email, Telefone, UTM Source, UTM Medium, UTM Campaign
4. O usuário baixa o arquivo e usa o **Importar Leads** existente (que já funciona) para importar na BASE DE LEADS

### Implementação

**1 arquivo modificado:** `src/pages/LeadsDashboard.tsx`

- Adicionar botão "Exportar Clientes" ao lado do "Sincronizar Base"
- Ao clicar, faz query em `ticto_transactions` (customer_email, customer_name, customer_phone, utm_source) + `customer_purchases` via join com `unified_customers` (primary_email, full_name, primary_phone)
- Deduplica por email lowercase
- Gera e baixa `.xlsx` usando a lib `xlsx` (já instalada no projeto)

Assim o fluxo fica: **Exportar → Abrir funil BASE DE LEADS → Importar Leads → Selecionar arquivo → Pronto.**

