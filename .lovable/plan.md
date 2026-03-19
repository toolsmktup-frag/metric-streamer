

## Problema

A stored procedure `sync_leads_from_sales` insere leads na tabela `leads`, mas alguns clientes em `unified_customers` não possuem telefone válido (>= 8 dígitos) NEM email válido (contendo @). A constraint `leads_has_contact` exige pelo menos um dos dois, causando o erro.

## Causa Raiz

No **STEP 3** (linha 90-111 do SQL), o INSERT aplica validações que podem anular tanto `phone` quanto `email`, mas não filtra esses registros antes de inserir.

## Solução

Adicionar um filtro `WHERE` no STEP 3 para excluir clientes sem nenhum contato válido. Alterar apenas a stored procedure SQL:

```sql
-- Linha 111: adicionar filtro após "WHERE uc.organization_id = v_org_id"
WHERE uc.organization_id = v_org_id
  AND (
    (uc.primary_phone IS NOT NULL AND length(regexp_replace(uc.primary_phone, '\D', '', 'g')) >= 8)
    OR
    (uc.primary_email IS NOT NULL AND uc.primary_email LIKE '%@%')
  );
```

## Arquivo Alterado

- `docs/sql/sync_leads_from_sales.sql` — adicionar filtro na query do STEP 3 (linha 111)

## Passos para o Usuário

1. Eu atualizo o arquivo SQL no projeto
2. Voce roda o `CREATE OR REPLACE FUNCTION` atualizado no SQL Editor do Supabase
3. Roda o reset + sync novamente (os 3 passos anteriores)

