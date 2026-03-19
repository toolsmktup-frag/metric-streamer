
Objetivo: permitir deixar o lead como “Sem vendedor” e fazer isso aparecer corretamente na aba lateral, sem parecer que “não registrou”.

1. Confirmar o comportamento atual
- O componente já tem a opção “Sem vendedor”.
- Ao selecionar essa opção, o código converte para `null`:
```text
const assignedTo = value === '__none__' ? null : value;
```
- Então não precisa de outro SQL específico só para “sem vendedor”, desde que a coluna `assigned_to` e a policy de `UPDATE` já existam.

2. Corrigir o motivo de “não registrar na aba”
- O problema mais provável não é o Supabase, e sim o estado da UI.
- Hoje a tela salva `selectedLead` como objeto estático quando você clica no card.
- Depois que a mutation atualiza o lead e a query recarrega, a aba lateral continua com o objeto antigo.
- Recomendação:
  - guardar apenas `selectedLeadId`
  - buscar o lead selecionado novamente a partir de `positions`
  - passar para `LeadTimeline` sempre o lead atualizado da lista recarregada

3. Garantir atualização visual imediata
- Ajustar o fluxo para que, ao trocar vendedor ou escolher “Sem vendedor”, o card e a aba lateral reflitam o novo valor sem precisar fechar/reabrir.
- Se necessário, usar atualização otimista local no `useAssignLead` além do invalidate da query.

4. Melhorar a exibição do estado vazio
- No seletor normal da aba lateral, mostrar explicitamente “Sem vendedor” quando `assigned_to` for `null`.
- No modo compacto do card, manter o ícone/placeholder de atribuição quando estiver sem responsável.
- Isso evita a sensação de campo “em branco” ou “não salvou”.

5. Validar backend mínimo necessário
- Conferir se já está tudo pronto no banco:
  - coluna `public.leads.assigned_to`
  - policy `FOR UPDATE` em `public.leads`
- Se isso já foi rodado, não precisa mais SQL para esse caso.

Detalhe técnico
```text
Causa provável:
LeadFunnelDetail guarda `selectedLead` em state.
Quando `useAssignLead` invalida `['leads-by-funnel', funnelId]`,
`positions` atualiza, mas `selectedLead` não.

Correção recomendada:
- trocar `selectedLead: Lead | null`
  por `selectedLeadId: string | null`
- derivar:
  const selectedLead = positions.find(p => p.lead_id === selectedLeadId)?.lead ?? null
- continuar abrindo a mesma aba, mas sempre com dados frescos
```

Resultado esperado
- Você consegue escolher um vendedor
- Você consegue voltar para “Sem vendedor”
- O card e a aba lateral mostram isso corretamente na hora
- Não fica parecendo que “salvou no toast, mas não registrou na tela”

<lov-actions>
<lov-suggestion message="Teste isso end-to-end: atribua um vendedor, depois volte para 'Sem vendedor', e confirme se o card e a aba lateral atualizam sem fechar a tela">Verificar que funciona</lov-suggestion>
<lov-suggestion message="Implemente a correção da aba lateral usando selectedLeadId em vez de guardar o objeto selectedLead, para o vendedor atribuído atualizar em tempo real">Corrigir atualização da aba</lov-suggestion>
<lov-suggestion message="Melhore o seletor para exibir claramente 'Sem vendedor' no painel lateral e um estado vazio mais visível no card do lead">Melhorar estado sem vendedor</lov-suggestion>
</lov-actions>
