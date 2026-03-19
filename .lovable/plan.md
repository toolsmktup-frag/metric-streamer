

## Diagnóstico: Sync para em 1000 leads

### O que aconteceu
A função criou 1000 leads (2 batches de 500) e depois morreu silenciosamente. O `EdgeRuntime.waitUntil()` tem um limite de tempo (~150s no Supabase), e processar 36k+ clientes com inserções individuais em batch sequencial estoura esse limite. O status fica preso em "processing" para sempre porque o processo morre sem atualizar o log.

### Solução: Mover a lógica para uma função PostgreSQL

Em vez de fazer 72+ chamadas REST sequenciais desde a Edge Function, criar uma **stored procedure (plpgsql)** que executa tudo direto no banco -- sem overhead de rede, ordens de magnitude mais rápido.

### Mudanças

**1. Criar função SQL `sync_leads_from_sales()`**
- Roda direto no PostgreSQL via `SELECT sync_leads_from_sales()`
- Faz o mesmo que a Edge Function: limpa leads antigos, lê `unified_customers` + `customer_purchases`, cria leads, posiciona nos stages, insere eventos
- Sem limite de 150s (funções SQL podem rodar por minutos)
- Retorna contagem de leads criados

**2. Simplificar a Edge Function**
- Cria o log entry
- Chama `SELECT sync_leads_from_sales(log_id)` via RPC
- A stored procedure atualiza o `meta_sync_log` ao finalizar
- Mantém `EdgeRuntime.waitUntil()` mas agora é uma única chamada RPC em vez de centenas

**3. Arquivo modificado**
- `supabase/functions/sync-leads-from-sales/index.ts` -- simplificar para chamar a RPC

**4. SQL a executar no Supabase Dashboard (SQL Editor)**
- Criar a função `sync_leads_from_sales(p_log_id uuid)` que faz todo o trabalho pesado

### SQL da stored procedure (resumo da lógica)
```text
CREATE OR REPLACE FUNCTION sync_leads_from_sales(p_log_id uuid)
RETURNS integer AS $$
  1. Detecta organization_id
  2. Limpa leads/events/positions existentes (DELETE direto, sem paginação)
  3. Cria/garante funil "BASE DE LEADS" com stages
  4. INSERT INTO leads SELECT ... FROM unified_customers (um único INSERT)
  5. INSERT INTO lead_stage_positions baseado em customer_purchases
  6. INSERT INTO lead_events baseado em customer_purchases
  7. UPDATE meta_sync_log SET status='completed'
  8. RETURN count
$$ LANGUAGE plpgsql;
```

### Por que funciona
- Um `INSERT INTO ... SELECT` de 36k linhas leva ~2 segundos no PostgreSQL
- Zero overhead de rede (tudo dentro do banco)
- Sem limites de CPU da Edge Function

