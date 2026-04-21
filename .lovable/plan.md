
## Duplicar automação escolhendo vincular ou não a um Funil de Leads

Sim, dá pra fazer. A ideia é trocar o “Duplicar” direto por um pequeno diálogo antes de criar a cópia, onde você escolhe o destino:

```text
Duplicar automação
├─ Deixar avulsa / sem funil
└─ Vincular a um Funil de Leads
   └─ Select: escolher o funil
```

## Como vai funcionar

Na tela `/ferramentas/automacoes`, ao clicar em **Duplicar**:

1. Abre um modal “Duplicar automação”.
2. Mostra o nome da automação original.
3. Você escolhe:
   - **Avulsa / sem funil**: cria a cópia sem vínculo com nenhum funil de leads.
   - **Vincular a um funil**: cria a cópia e já insere o vínculo em `lead_funnel_automations`.
4. A cópia sempre nasce **inativa**, como já acontece hoje.
5. Depois de duplicar, a listagem atualiza e mostra a automação no lugar certo:
   - Em **Avulsos**, se não tiver funil.
   - Dentro do grupo do funil escolhido, se tiver vínculo.
6. Exibir toast claro:
   - `Automação duplicada como avulsa`
   - `Automação duplicada e vinculada ao funil`

## Comportamento importante

Hoje o `useDuplicateWzFlow()` só duplica a linha em `wz_flows`.

A mudança vai permitir passar opções:

```ts
{
  id: flowId,
  targetFunnelId?: string | null,
  showInAutomations?: boolean
}
```

Se `targetFunnelId` vier preenchido, depois de criar o novo `wz_flow`, o sistema também cria:

```ts
lead_funnel_automations {
  funnel_id: targetFunnelId,
  wz_flow_id: duplicatedFlow.id,
  trigger_events: [],
  show_in_automations: true
}
```

Se não escolher funil, não cria vínculo nenhum.

## UI proposta

No dropdown do card continua igual:

```text
Editar
Duplicar
Remover
```

Mas ao clicar em **Duplicar**, em vez de duplicar imediatamente, abre:

```text
Duplicar automação

Como você quer salvar a cópia?

( ) Avulsa / sem funil
    A cópia aparece em "Avulsos" e não fica presa a nenhum CRM.

( ) Vincular a um Funil de Leads
    Escolha em qual funil essa automação deve aparecer.

[ Select: Funil de Leads ]

[Cancelar] [Duplicar]
```

## Arquivos impactados

### `src/components/wz-automation/WzFlowList.tsx`

- Adicionar estado para controlar o fluxo selecionado para duplicação.
- Buscar lista de funis de leads disponíveis.
- Adicionar modal de duplicação.
- Trocar `onDuplicate={() => duplicateFlow.mutate(flow.id)}` por abertura do modal.
- Ao confirmar, chamar a mutation com as opções escolhidas.
- Invalidar/atualizar a listagem para o agrupamento refletir o destino.

### `src/hooks/useWzFlows.ts`

- Atualizar `useDuplicateWzFlow()` para aceitar:
  - `id`
  - `targetFunnelId`
  - `showInAutomations`
- Manter compatibilidade com duplicação avulsa.
- Criar vínculo em `lead_funnel_automations` quando houver funil escolhido.
- Invalidar:
  - `wz-flows`
  - `lead-funnel-automations-visibility`
  - `lead-funnel-automations` do funil escolhido

## Regras de segurança/consistência

- A automação duplicada continuará nascendo com `is_active: false`.
- Não copiar histórico de execuções.
- Não copiar agendamentos pendentes.
- Copiar apenas estrutura do fluxo: `nodes`, `edges`, `platform`, filtros e configurações salvas.
- Se houver erro ao vincular ao funil, mostrar erro e não deixar a UI parecer que deu certo.

## Resultado esperado

Você vai conseguir duplicar uma automação e decidir na hora:

```text
Quero essa cópia solta
ou
Quero essa cópia já dentro do funil X
```

Isso resolve o caso de criar variações por produto/funil sem precisar duplicar e depois ficar caçando onde vincular manualmente.
