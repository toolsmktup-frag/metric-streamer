

## Diagnóstico e Correção do Sync

### Problema identificado
A Edge Function `sync-leads-from-sales` retorna `total_contacts: 0` por dois motivos prováveis:

1. **A função no Supabase NÃO foi atualizada** -- o código otimizado existe apenas no Lovable, mas o projeto usa Supabase externo, então a função precisa ser copiada manualmente no Dashboard do Supabase.

2. **O `ORG_ID` pode não bater** -- o valor hardcoded `00000000-0000-0000-0000-000000000001` pode não corresponder ao `organization_id` real nos registros de `unified_customers` e `customer_purchases`.

### Ações necessárias

**Passo 1: Validar o ORG_ID**
Adicionar logging na função para mostrar quantos registros existem sem filtro de `organization_id`, para confirmar se o problema é o ID.

**Passo 2: Tornar o ORG_ID dinâmico**
Em vez de hardcoded, buscar o `organization_id` real a partir dos dados existentes em `unified_customers` (pegar o primeiro registro e usar seu org_id), ou aceitar via parâmetro no request body.

**Passo 3: Deploy manual**
Após a correção, o usuário precisará copiar o conteúdo de `supabase/functions/sync-leads-from-sales/index.ts` e colar no Dashboard do Supabase (Edge Functions > sync-leads-from-sales).

### Mudanças no arquivo
- `supabase/functions/sync-leads-from-sales/index.ts`:
  - Remover `ORG_ID` hardcoded
  - Buscar o `organization_id` real de `unified_customers` automaticamente (ou do body do request)
  - Adicionar logs de diagnóstico para facilitar debug

### Resultado
A função vai encontrar os 36K+ clientes independentemente do `organization_id` usado, e o usuário poderá confirmar o deploy copiando o código para o Dashboard do Supabase.

