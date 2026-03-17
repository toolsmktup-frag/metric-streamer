

# Polling de Métricas em Tempo Real no Flow Editor

## O que fazer

Adicionar `refetchInterval: 30000` ao hook `useFunnelLeadCounts` para que os contadores de leads nos nodes se atualizem automaticamente a cada 30 segundos. Propagar as mudanças de `leadCounts` para os nodes no canvas.

## Mudanças

### 1. `src/hooks/useLeads.ts` — Ativar polling no `useFunnelLeadCounts`
- Adicionar `refetchInterval: 30000` nas opções do `useQuery`
- Isso faz o React Query re-buscar os dados a cada 30s automaticamente

### 2. `src/components/lead-funnels/FunnelFlowEditor.tsx` — Reagir a mudanças de `leadCounts`
- Adicionar um `useEffect` que observa mudanças no prop `leadCounts` e atualiza o `data.count` dos nodes de stage no canvas
- Sem isso, os nodes manteriam o valor inicial mesmo com novos dados

Duas edições simples, sem novos arquivos nem migrations.

