

## Tudo que precisa no Supabase — Automações WhatsApp

Vou gerar um documento completo com tudo pronto pra copiar/colar no Supabase.

---

### 1. Tabelas SQL (SQL Editor)

As 4 tabelas já existem no projeto (`docs/wz-automation-tables.sql`). Se ainda não foram criadas no Supabase, rodar no SQL Editor:

- `wz_instances` — instâncias WhatsApp (API URL + key)
- `wz_flows` — fluxos com nodes/edges em JSONB
- `wz_executions` — execuções em andamento/finalizadas
- `wz_scheduled_steps` — passos agendados (timers, smart delays)

Todas com RLS habilitado e policies configuradas.

### 2. pg_cron (SQL Editor)

O scheduler precisa de um cron job que roda a cada minuto:

```sql
SELECT cron.schedule(
  'wz-scheduler-every-minute',
  '* * * * *',
  $$
  SELECT net.http_post(
    url := '<SUPABASE_URL>/functions/v1/wz-scheduler',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer <SERVICE_ROLE_KEY>'
    ),
    body := '{}'::jsonb
  );
  $$
);
```

### 3. Edge Functions (3 funções para deploy)

Copiar/colar cada uma no Dashboard do Supabase (Functions > Deploy):

| Função | Arquivo local | Linhas | JWT |
|---|---|---|---|
| **wz-receiver** | `supabase/functions/wz-receiver/index.ts` | 542 linhas | `verify_jwt = false` |
| **wz-executor** | `supabase/functions/wz-executor/index.ts` | 552 linhas | `verify_jwt = false` |
| **wz-scheduler** | `supabase/functions/wz-scheduler/index.ts` | 163 linhas | `verify_jwt = false` |

### 4. Secrets necessárias no Supabase

As Edge Functions usam estas variáveis (já existem por padrão no Supabase):
- `SUPABASE_URL` — automático
- `SUPABASE_ANON_KEY` — automático
- `SUPABASE_SERVICE_ROLE_KEY` — automático

Nenhuma secret adicional é necessária.

---

### Plano de entrega

Vou gerar **um único arquivo** `/mnt/documents/supabase-automacoes-completo.md` com tudo organizado em seções copiáveis:

1. **SQL das tabelas** — copiar e rodar no SQL Editor
2. **SQL do pg_cron** — copiar e rodar no SQL Editor
3. **wz-receiver** — código completo da função
4. **wz-executor** — código completo da função
5. **wz-scheduler** — código completo da função
6. **Checklist de deploy** — passo a passo

Tudo pronto pra copiar/colar direto no Dashboard do Supabase.

