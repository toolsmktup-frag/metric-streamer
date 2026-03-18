

## Problema Encontrado

A Edge Function `sync-leads-from-sales` consulta colunas **erradas** na tabela `unified_customers`:

```text
Edge Function usa:     .select("id, email, phone, name")
Colunas reais:         primary_email, primary_phone, full_name
```

Resultado: a query retorna `null` para email/phone/name de todos os clientes, e como nenhum match funciona, `total_contacts = 0`.

## Plano

### Corrigir a Edge Function (1 arquivo)

**Arquivo:** `supabase/functions/sync-leads-from-sales/index.ts`

Trocar a query de `unified_customers`:
- `email` → `primary_email`
- `phone` → `primary_phone`  
- `name` → `full_name`

E ajustar o mapeamento no `custMap` para usar os nomes corretos dos campos.

Nenhuma outra mudanca necessaria. Apos o deploy, o sync deve encontrar os clientes corretamente e criar leads apenas para quem tem compras aprovadas.

