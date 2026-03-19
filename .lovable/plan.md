

## Mostrar nome do vendedor no card do Kanban

### O que muda

No `LeadCard.tsx`, ao lado do avatar compacto do vendedor (que já existe), vamos exibir o **nome** do vendedor responsável como um badge de texto. O card já carrega `lead.assigned_to` e já importa `LeadAssignSelect` que usa `useTeamMembers` — vamos reutilizar esses dados.

### Como

**Editar: `src/components/lead-funnels/LeadCard.tsx`**

1. Importar `useTeamMembers` do hook existente
2. Buscar o nome do membro atribuído (`lead.assigned_to`) na lista de membros
3. Exibir um badge com o nome do vendedor abaixo dos badges de LTV/recontato (na área `ml-[42px]`), com ícone de `User` e estilo similar aos outros badges

O nome aparecerá como:
```text
👤 Maria Silva
```

Em badge azul/primary discreto, visível sem precisar abrir o card. Se não houver vendedor atribuído, não mostra nada (o avatar compacto já indica "sem vendedor").

### Impacto

- Apenas 1 arquivo editado
- Reutiliza o hook `useTeamMembers` que já é carregado pelo `LeadAssignSelect` (sem queries extras)
- Sem mudanças no banco de dados

