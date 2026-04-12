

## Simplificar: Remover badges de evento do vínculo no funil

### Problema

Hoje existe duplicação: os gatilhos já são configurados dentro do editor do fluxo (nós trigger no canvas). Os badges "Compra Aprovada", "PIX Gerado" etc. na config do funil são uma segunda camada que não conversa com o fluxo — só confunde.

### Solução

Remover a seleção de `trigger_events` da interface do funil. O vínculo funil↔automação fica simples:
- **Toggle ativo/inativo** — liga ou desliga o fluxo para este funil
- **Toggle "Exibir em Automações"** — controla se aparece na lista geral
- **Botão editar** — abre o editor do fluxo onde os gatilhos são configurados de verdade

O campo `trigger_events` continua existindo na tabela (não precisa de migration), mas a UI não exibe mais os badges clicáveis.

### Arquivos alterados

| Arquivo | Mudança |
|---|---|
| `FunnelAutomationsConfig.tsx` | Remover seção de badges de trigger_events |
| `FunnelAutomationsTab.tsx` | Remover exibição dos trigger_events |

### Resultado

A configuração de gatilho fica em **um lugar só**: dentro do editor do fluxo. No funil, o usuário só decide se o fluxo está ativo e se quer que apareça na lista geral de automações.

