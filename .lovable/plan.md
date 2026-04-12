

## Corrigir 2 inconsistências na tela de Automações

### Problema 1: Plural errado — "21 açãoões"
**Arquivo**: `src/components/wz-automation/WzFlowList.tsx` linha 369

O código atual faz:
```
ação{count !== 1 ? 'ões' : ''}
```
Isso produz "ação" (singular OK) mas "açãoões" (plural errado). O correto é:
```
aç{count !== 1 ? 'ões' : 'ão'}
```

### Problema 2: Toggle Ativo/Inativo dessincronizado

São dois toggles **independentes** controlando coisas diferentes:
- **Tela de Automações** (`WzFlowList`): toggle do `wz_flows.is_active` — controla se o **fluxo** está ativo
- **Tela do Funil** (`FunnelAutomationsTab`): toggle do `lead_funnel_automations.is_active` — controla se o **vínculo** está ativo

**Solução**: O toggle do funil deve controlar o `wz_flows.is_active` diretamente (o campo que realmente importa para a execução). Quando o usuário ativar/desativar no funil, ele atualiza o flow, não apenas o link. Isso sincroniza ambas as telas.

**Alterações**:
- `FunnelAutomationsTab.tsx`: o `onToggle` passa a fazer update em `wz_flows.is_active` (via supabase direto) + invalidar query `wz-flows`
- `FunnelAutomationsConfig.tsx`: mesma mudança no toggle
- `WzFlowList.tsx`: corrigir o plural de "ações"

### Arquivos editados
1. `src/components/wz-automation/WzFlowList.tsx` — fix plural
2. `src/components/lead-funnels/FunnelAutomationsTab.tsx` — toggle sincroniza `wz_flows.is_active`
3. `src/components/lead-funnels/FunnelAutomationsConfig.tsx` — toggle sincroniza `wz_flows.is_active`

