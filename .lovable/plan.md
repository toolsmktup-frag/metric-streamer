

## Resiliência + Histórico por Nó (estilo n8n)

### O que muda

Hoje o executor processa nós sem registrar o resultado individual de cada um. A aba "Execuções" mostra só o payload bruto. Não há retry nem paralelização no scheduler.

### Arquitetura proposta

**Nova tabela: `wz_execution_logs`** — registra cada nó processado com status, input/output, duração e erro.

```text
wz_execution_logs
├── id (uuid PK)
├── execution_id (FK → wz_executions)
├── node_id (text)
├── node_type (text)
├── status (text: success | failed | skipped)
├── input_data (jsonb) — variáveis que entraram no nó
├── output_data (jsonb) — resultado (ex: API response, path escolhido)
├── error_message (text)
├── started_at (timestamptz)
├── finished_at (timestamptz)
└── created_at (timestamptz)
```

---

### 1. SQL — Nova tabela + RLS

Migration para criar `wz_execution_logs` com políticas de leitura para `authenticated` e escrita para `service_role`.

### 2. Backend — wz-executor com logging por nó

Cada handler de nó (whatsapp, condition, ab_split, webhook, tag, timer, etc.) passa a:
- Inserir um log em `wz_execution_logs` com `started_at` antes de processar
- Atualizar com `output_data`, `status`, `finished_at` após processar
- Em caso de erro, gravar `error_message` e `status: failed`

Dados gravados por tipo:
- **whatsapp**: phone, blocks enviados, status HTTP de cada bloco
- **condition**: variável avaliada, resultado (yes/no)
- **ab_split**: rand gerado, path selecionado
- **webhook**: URL, status HTTP, response body (truncado)
- **tag**: tag name, action, lead_id
- **timer/smart_delay**: run_at calculado
- **goto**: target node

### 3. Backend — wz-scheduler com retry + paralelização

- **Retry**: adicionar coluna `retry_count` (default 0) em `wz_scheduled_steps`. Se falhar e `retry_count < 3`, voltar para `pending` com `retry_count + 1` em vez de `failed`.
- **Paralelização**: processar steps em batches de 10 usando `Promise.allSettled` em vez de loop sequencial.
- **Limit**: aumentar de 50 para 100 steps por ciclo.

### 4. Frontend — Histórico por nó na aba Execuções

Ao expandir uma execução na tabela, em vez de mostrar só o JSON do payload, mostrar uma **timeline vertical** dos nós processados (estilo n8n):

```text
┌─────────────────────────────────────┐
│ ▶ Trigger (compra_aprovada)   ✅ 0.1s │
│ ▶ WhatsApp (Boas-vindas)      ✅ 1.2s │
│ ▶ Timer (30 min)              ✅ 30m   │
│ ▶ Condition (tem_email?)      ✅ yes   │
│ ▶ WhatsApp (Upsell)           ❌ 0.8s │
│   └ Erro: UAZAPI 429 rate limit     │
└─────────────────────────────────────┘
```

Cada nó é clicável para ver input/output completo.

### 5. Frontend — Métricas no topo da aba Execuções

Cards de resumo:
- Total hoje / últimos 7 dias
- Concluídas vs Falhadas (%)
- Tempo médio de execução
- Steps pendentes no scheduler

Query via `useWzExecutions` existente + nova query para `wz_scheduled_steps` pendentes.

---

### Arquivos modificados

| Arquivo | Mudança |
|---|---|
| `supabase/migrations/xxx_wz_execution_logs.sql` | Nova tabela + RLS |
| `supabase/migrations/xxx_wz_scheduled_retry.sql` | Coluna `retry_count` |
| `supabase/functions/wz-executor/index.ts` | Logging por nó |
| `supabase/functions/wz-scheduler/index.ts` | Retry + batch parallel |
| `src/types/wz-automation.ts` | Tipo `WzExecutionLog` |
| `src/hooks/useWzExecutionLogs.ts` | Novo hook para buscar logs por execution_id |
| `src/hooks/useWzExecutionStats.ts` | Novo hook para métricas |
| `src/components/wz-automation/WzExecutionHistory.tsx` | Timeline de nós + cards de métricas |
| `/mnt/documents/supabase-automacoes-completo_v3.md` | Documento atualizado com SQL e código das Edge Functions |

