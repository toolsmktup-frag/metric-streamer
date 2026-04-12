

## Métricas por Nó no Canvas — Plano de Implementação

### Resumo

Adicionar contadores de execução (Enviado/Sucesso/Falha) diretamente nos nós do canvas, estilo ManyChat.

### Pré-requisito: SQL no Supabase

A tabela `wz_execution_logs` já existe e é populada pelo `wz-executor`. Precisamos apenas garantir que a query client-side funcione. Como o hook usa `as any` para contornar a tipagem, não precisa de migration.

Porém, precisamos de uma **política RLS** para leitura autenticada (caso ainda não exista). Cole este SQL no **SQL Editor do Supabase**:

```sql
-- Criar tabela caso não exista (idempotente)
CREATE TABLE IF NOT EXISTS public.wz_execution_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  execution_id uuid NOT NULL REFERENCES public.wz_executions(id) ON DELETE CASCADE,
  node_id text NOT NULL,
  node_type text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'running',
  input_data jsonb,
  output_data jsonb,
  error_message text,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.wz_execution_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated read wz_execution_logs" ON public.wz_execution_logs;
CREATE POLICY "Authenticated read wz_execution_logs"
  ON public.wz_execution_logs FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Service write wz_execution_logs" ON public.wz_execution_logs;
CREATE POLICY "Service write wz_execution_logs"
  ON public.wz_execution_logs FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Index para a query de agregação
CREATE INDEX IF NOT EXISTS idx_wz_exec_logs_exec_id ON public.wz_execution_logs(execution_id);
CREATE INDEX IF NOT EXISTS idx_wz_exec_logs_node_id ON public.wz_execution_logs(node_id);
```

### Implementação no código

#### 1. Novo hook: `src/hooks/useWzFlowNodeStats.ts`
- Recebe `flowId`
- Busca `wz_execution_logs` via join com `wz_executions` (filtrado por flow_id)
- Agrupa client-side por `node_id` → `{ total, success, failed }`
- Retorna `Record<string, { total: number; success: number; failed: number }>`
- Refresh automático a cada 30s

#### 2. Atualizar `WzFlowCanvasEditor.tsx`
- Importar `useWzFlowNodeStats(flowId)`
- Injetar `data.stats` em cada nó antes de passar ao ReactFlow

#### 3. Atualizar nós visuais

**WzWhatsAppNode** — adicionar barra abaixo do body:
```
 125 Enviado  |  118 Sucesso  |  7 Falha
```
Números em `font-mono text-[10px]`, cores: cinza/verde/vermelho.

**WzTimerNode** — mostrar:
```
 45 Total  |  12 Esperando  |  33 Concluído
```
"Esperando" = steps pendentes (buscar de `wz_scheduled_steps` no mesmo hook).

**WzConditionNode** — mostrar contagem SIM/NÃO baseado em `output_data.result` dos logs.

**WzSmartDelayNode** — similar ao Timer.

#### 4. Arquivos alterados

| Arquivo | Ação |
|---|---|
| `src/hooks/useWzFlowNodeStats.ts` | Criar (hook de agregação) |
| `src/components/wz-automation/WzFlowCanvasEditor.tsx` | Injetar stats nos nós |
| `src/components/wz-automation/nodes/WzWhatsAppNode.tsx` | Exibir métricas |
| `src/components/wz-automation/nodes/WzTimerNode.tsx` | Exibir métricas |
| `src/components/wz-automation/nodes/WzConditionNode.tsx` | Exibir métricas |
| `src/components/wz-automation/nodes/WzSmartDelayNode.tsx` | Exibir métricas |

