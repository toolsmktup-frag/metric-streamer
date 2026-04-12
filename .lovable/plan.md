

## Corrigir Auto-Layout e Cópia com Conexões

### Problemas identificados

1. **Auto-layout bagunçando**: O dagre está configurado corretamente (`rankdir: 'LR'`), mas usa tamanho fixo `220x120` para todos os nós — incluindo nós de nota que são maiores. Além disso, o `nodesep: 60` e `ranksep: 200` podem causar sobreposição. O layout deveria respeitar os tamanhos reais dos nós e agrupar subfluxos independentes (cada trigger com seu caminho) verticalmente sem misturar.

2. **Cópia não mantém conexões**: Ao copiar múltiplos nós (Ctrl+C/V), as edges entre eles são ignoradas — só os nós são colados, sem as ligações.

### Plano

**1. Melhorar Auto-Layout (dagre)**
- Usar tamanhos de nó variáveis por tipo (nota = 400x200, trigger = 240x140, action = 220x120, etc.)
- Aumentar `nodesep` para evitar sobreposição vertical
- Manter `rankdir: 'LR'` (esquerda para direita, como n8n)
- O dagre já lida com múltiplos subgrafos desconectados — cada trigger e seu caminho ficará em uma "faixa" separada automaticamente

**2. Cópia com conexões (Ctrl+C/V)**
- No Ctrl+C: salvar no clipboard tanto os nós selecionados quanto as edges cujo `source` E `target` estão ambos na seleção
- No Ctrl+V: gerar novos IDs para cada nó, criar um mapa `oldId → newId`, e recriar as edges com os IDs atualizados
- Resultado: ao colar um grupo de nós conectados, as ligações entre eles são preservadas

### Arquivos editados

- `src/components/wz-automation/WzFlowCanvasEditor.tsx` — ambas as correções no mesmo arquivo

