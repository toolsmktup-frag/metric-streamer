

## Problema

O SQL tenta criar policies que já existem no banco. Precisa adicionar `DROP POLICY IF EXISTS` antes de cada `CREATE POLICY`.

## Correção

Atualizar o documento `/mnt/documents/supabase-automacoes-completo.md` na seção de tabelas SQL, adicionando `DROP POLICY IF EXISTS` antes de cada policy. Também adicionar `CREATE TABLE IF NOT EXISTS` (que já tem) e `IF NOT EXISTS` nos índices.

O SQL corrigido ficará assim para cada tabela:

```sql
-- wz_instances
DROP POLICY IF EXISTS "Authenticated read wz_instances" ON public.wz_instances;
DROP POLICY IF EXISTS "Authenticated write wz_instances" ON public.wz_instances;
CREATE POLICY ...

-- wz_flows
DROP POLICY IF EXISTS "Authenticated full wz_flows" ON public.wz_flows;
CREATE POLICY ...

-- wz_executions
DROP POLICY IF EXISTS "Authenticated read wz_executions" ON public.wz_executions;
DROP POLICY IF EXISTS "Service write wz_executions" ON public.wz_executions;
CREATE POLICY ...

-- wz_scheduled_steps
DROP POLICY IF EXISTS "Service full wz_scheduled_steps" ON public.wz_scheduled_steps;
DROP POLICY IF EXISTS "Authenticated read wz_scheduled_steps" ON public.wz_scheduled_steps;
CREATE POLICY ...
```

Vou regenerar o documento completo com o SQL seguro para re-execução (idempotente).

