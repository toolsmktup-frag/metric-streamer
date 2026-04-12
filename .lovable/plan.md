

## Replay de Execução (estilo n8n)

### O que já existe
- `wz_executions.trigger_payload` → payload bruto do webhook já salvo
- `wz_executions.variables` → variáveis calculadas já salvas
- `wz_execution_logs` → timeline completa por nó com input/output
- UI de execuções com timeline expansível

### O que falta

**1. Botão "Reprocessar" na UI** (`WzExecutionHistory.tsx`)
- Adicionar botão `RefreshCw` em cada execução na lista
- Ao clicar, chama `supabase.functions.invoke('wz-executor', { body: { replay_execution_id } })`
- Mostra toast de confirmação/erro

**2. Lógica de replay no `wz-executor`** (`supabase/functions/wz-executor/index.ts`)
- Aceitar campo `replay_execution_id` no body
- Se presente: buscar a execução original, criar uma NOVA execução com os mesmos dados (`flow_id`, `contact_phone`, `trigger_payload`, `variables`), marcar `trigger_event: 'replay'`
- Executar o fluxo normalmente a partir do primeiro nó (após o trigger)
- A execução original não é tocada — o replay gera um registro independente

**3. Indicador visual de replay**
- Badge "Replay" na execução reprocessada (quando `trigger_event === 'replay'`)

### Arquivos editados
- `supabase/functions/wz-executor/index.ts` — aceitar `replay_execution_id`
- `src/components/wz-automation/WzExecutionHistory.tsx` — botão reprocessar + badge replay

### Resultado
Você clica em "Reprocessar" em qualquer execução passada → o sistema cria uma nova execução com o mesmo payload → roda o fluxo inteiro de novo → você vê o resultado na timeline, sem precisar gerar um novo checkout.

