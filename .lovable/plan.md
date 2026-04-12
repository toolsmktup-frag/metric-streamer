

## Corrigir filtro de vendedores no Divisor

**Problema**: Na última alteração, removi o filtro de role e agora qualquer membro ativo aparece na lista (admin, gestor, etc.). O correto é mostrar apenas vendedores.

**O que o clique não funcionava**: O bug real era que duas chamadas `update()` sequenciais se sobrescreviam (sellers e paths). Isso já foi corrigido com o `sellerToggleSelection`. O filtro de role não era o problema.

### Plano

1. **Restaurar filtro de role** em `WzNodeConfigPanel.tsx` (linha 670):
   - De: `teamMembers.filter((m) => m.status === 'active')`
   - Para: `teamMembers.filter((m) => ['vendedor', 'vendedora', 'suporte'].includes(m.role) && m.status === 'active')`

Apenas essa linha muda. O fix do clique (sellerToggleSelection) permanece intacto.

