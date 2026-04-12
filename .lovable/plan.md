

## Adicionar botão "Criar Automação" na aba do funil

### O que muda

Adicionar um botão nas telas de automações do funil que cria um novo fluxo de automação já vinculado automaticamente ao funil atual, sem precisar sair da página.

### Como funciona para o usuário

1. Na aba **Automações** ou na seção de automações da **Configuração**, aparece um botão **"+ Criar Automação"**
2. Ao clicar, o sistema cria um novo fluxo com nome padrão (ex: "Automação - RECOMPRA - POTES") e já vincula ao funil com `show_in_automations = false` (só neste funil)
3. O fluxo abre automaticamente no editor em nova aba para o usuário configurar

### Arquivos alterados

| Arquivo | Mudança |
|---|---|
| `FunnelAutomationsConfig.tsx` | Botão "Criar Automação" ao lado do select de vincular. Ao clicar: insere em `wz_flows`, insere em `lead_funnel_automations`, abre nova aba |
| `FunnelAutomationsTab.tsx` | Mesmo botão no estado vazio e no topo da lista |

### Detalhes técnicos

- Usa `supabase.from('wz_flows').insert(...)` para criar o fluxo com `name` baseado no nome do funil
- Depois `linkMutation.mutate(...)` para vincular ao funil
- Abre `window.open(/ferramentas/automacoes/{newFlowId}, '_blank')` após criação
- Invalida queries de `wz_flows` e `lead_funnel_automations`

