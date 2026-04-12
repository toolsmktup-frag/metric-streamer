

## Novos blocos para o canvas de automações

Atualmente o canvas tem: Gatilhos (9 tipos), Ações (WhatsApp, Timer, Condição If/Else, Parar Fluxo, Cancelar Anteriores) e Utilidades (Anotação). Vou adicionar mais blocos úteis:

### Novos nós a criar

| Bloco | Tipo | Descrição | Handles |
|---|---|---|---|
| **Divisor A/B** | `ab_split` | Divide o fluxo em 2-3 caminhos com % configurável (ex: 50/50, 70/30). Para testar mensagens diferentes | 1 entrada, 2-3 saídas (Caminho A, B, C) |
| **Delay Inteligente** | `smart_delay` | Aguarda até um horário específico (ex: "próximo dia útil às 9h") em vez de tempo fixo | 1 entrada, 1 saída |
| **Webhook HTTP** | `webhook` | Dispara uma chamada HTTP para sistema externo (CRM, planilha, API) | 1 entrada, 1 saída |
| **Tag / Marcar Lead** | `tag` | Adiciona tag ou atualiza campo do lead (ex: marcar como "recuperado") | 1 entrada, 1 saída |
| **Goto / Pular para** | `goto` | Redireciona para outro ponto do fluxo (evita linhas cruzadas) | 1 entrada, referência a outro nó |

### Arquivos a criar
- `src/components/wz-automation/nodes/WzAbSplitNode.tsx` — nó visual com 2-3 saídas coloridas e labels de %
- `src/components/wz-automation/nodes/WzSmartDelayNode.tsx` — ícone de relógio com config de horário/dia
- `src/components/wz-automation/nodes/WzWebhookNode.tsx` — ícone de link/globe com URL configurável
- `src/components/wz-automation/nodes/WzTagNode.tsx` — ícone de tag com nome da tag
- `src/components/wz-automation/nodes/WzGotoNode.tsx` — ícone de seta circular com seletor de nó destino

### Arquivos a editar
- `WzFlowSidebar.tsx` — adicionar os 5 novos itens na seção Ações/Utilidades
- `WzFlowCanvasEditor.tsx` — registrar os 5 novos `nodeTypes` e tratar o drop com dados default
- `WzNodeConfigPanel.tsx` — adicionar painéis de configuração para cada novo tipo
- `WzDragData` type — expandir com os novos nodeTypes

### Config de cada nó

- **A/B Split**: slider de porcentagem por caminho, número de caminhos (2 ou 3)
- **Smart Delay**: seletor de dia da semana, horário, opção "próximo dia útil"
- **Webhook**: URL, método (GET/POST), headers, body template com variáveis
- **Tag**: nome da tag, ação (adicionar/remover)
- **Goto**: dropdown com lista de nós do fluxo atual

