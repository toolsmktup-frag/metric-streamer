

## Plano: Vendedor Responsável por Lead

### ✅ Implementado

1. **Migration** — coluna `assigned_to uuid` na tabela `leads` com índice
2. **Tipo `Lead`** — campo `assigned_to` adicionado em `src/types/leadFunnels.ts`
3. **Hook `useAssignLead`** — mutation para atribuir/remover vendedor de um lead
4. **Componente `LeadAssignSelect`** — dropdown compacto (avatar no card) e normal (no detalhe)
5. **LeadCard** — avatar de atribuição ao lado do botão WhatsApp
6. **LeadTimeline** — dropdown de atribuição de vendedor no painel lateral do lead
7. **KanbanBoard** — filtro de visibilidade: vendedores só veem leads atribuídos a eles ou sem atribuição
8. **LeadFunnelDetail** — passa `currentUserId` para o Kanban

### 🔜 Próximos passos (fase futura)

- Roteamento de chat WhatsApp pelo vendedor (filtrar chat list por `assigned_to`)
- Atribuição automática (round-robin, por etapa, por último vendedor que interagiu)
- Atribuição em lote (selecionar múltiplos leads → atribuir vendedor)
