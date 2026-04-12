

## Organizar Automações por Funil

### O que muda

A tela de Automações (`WzFlowList`) ganha um sistema de agrupamento e filtro por funil, mostrando as automações organizadas em seções colapsáveis.

### Como vai funcionar

1. **Buscar dados de vínculo funil ↔ fluxo**: Expandir a query de `lead_funnel_automations` para trazer também `funnel_id` e o nome do funil (join com `lead_funnels`).

2. **Agrupar fluxos por funil**: Os fluxos vinculados a funis aparecem agrupados sob o nome do funil (seções colapsáveis com accordion/disclosure). Fluxos sem vínculo com nenhum funil aparecem numa seção "Sem funil" ou "Avulsos".

3. **Filtro por funil**: Um dropdown/select no topo permite filtrar por funil específico ou ver "Todos". Quando filtrado, só mostra a seção daquele funil.

4. **Toggle de visualização**: Opção de alternar entre a view agrupada (por funil) e a view flat atual (lista/grid simples).

### Layout visual

```text
[Filtrar por funil: Todos ▼]  [Grid | Lista]  [+ Novo Fluxo]

▼ Articulabem (2 automações)
  ┌──────────────┐  ┌──────────────┐
  │ Fluxo A      │  │ Fluxo B      │
  └──────────────┘  └──────────────┘

▼ SuperVITA (1 automação)
  ┌──────────────┐
  │ Fluxo C      │
  └──────────────┘

▼ Avulsos (1 automação)
  ┌──────────────┐
  │ Fluxo D      │
  └──────────────┘
```

### Arquivos editados

- **`src/components/wz-automation/WzFlowList.tsx`** — Expandir query de `lead_funnel_automations` para incluir `funnel_id, lead_funnels(id, name, color)`. Adicionar lógica de agrupamento, filtro por funil, e seções colapsáveis com Collapsible ou simples disclosure. Manter o FlowCard existente.

### Detalhes técnicos

- A query existente de `lead-funnel-automations-visibility` será expandida para trazer `wz_flow_id, show_in_automations, funnel_id, lead_funnels(id, name, color)`
- Agrupamento via `Map<string, WzFlow[]>` onde a key é o funnel_id (ou "standalone")
- Um fluxo pode aparecer em múltiplos funis se estiver vinculado a mais de um — isso é correto
- Fluxos standalone (sem vínculo) ficam na seção "Avulsos"
- Seções colapsáveis usando estado local (`Set<string>` de seções expandidas, todas abertas por padrão)

