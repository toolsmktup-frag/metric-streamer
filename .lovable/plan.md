

## Plano: Exibir receita total por etapa no Kanban

### Situação atual

O valor da venda **já é importado** — vai para `lead.metadata.amount` via o mapeamento de colunas (`valor`, `gross_amount`, etc.). O `LeadCard` já mostra o valor individual de cada lead. Porém, **não existe nenhum totalizador** por etapa/coluna no Kanban.

### O que fazer

**1. Totalizar receita por coluna no `KanbanBoard.tsx`**

- Para cada etapa, somar `metadata.amount` de todos os leads naquela coluna
- Exibir o total formatado em BRL no header da coluna, ao lado da contagem de leads
- Ex: `Comprador (450) · R$ 123.456,00`

**2. Totalizar receita geral do funil**

- Mostrar um resumo no topo do Kanban com o total de receita de todas as etapas
- Formato simples: `Total do funil: R$ X.XXX,XX`

### Escopo

- Arquivo único: `src/components/lead-funnels/KanbanBoard.tsx`
- Sem mudanças no banco, edge functions ou import — o dado já está lá

