

## Plano: Migrar todos os leads existentes para o funil BASE DE LEADS

### Problema

A função `sync-leads-from-sales` atual só cria leads a partir de `ticto_transactions` e `customer_purchases`. Leads que já existem na tabela `leads` (importados via planilha, criados por webhook de lead, etc.) **não são posicionados** no funil "BASE DE LEADS".

### Solução

Adicionar um **passo extra** na função `sync-leads-from-sales` que, após processar as vendas, varre **todos os leads da organização** que ainda não têm posição no funil BASE DE LEADS e os posiciona no estágio "Novo".

### Alteração

**Arquivo:** `supabase/functions/sync-leads-from-sales/index.ts`

Após o loop principal (linha ~210), adicionar:

1. Buscar todos os `leads` da organização
2. Para cada lead, verificar se já tem `lead_stage_positions` no funil BASE DE LEADS
3. Se não tem, inserir posição no primeiro estágio ("Novo")
4. Retornar contagem de leads migrados no response

O código adicional é simples: uma query de todos os leads, filtrando os que já estão posicionados, e batch insert dos faltantes.

### Resultado esperado

Ao clicar "Sincronizar Base", o sistema:
- Cria leads a partir de vendas (como hoje)
- **Também posiciona leads já existentes** (importados, webhook) no funil BASE DE LEADS
- Todos aparecem na lista e no Kanban do funil

