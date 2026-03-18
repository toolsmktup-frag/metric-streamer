

## Plano: Receita contextual por status + aba Métricas do Funil

### Problema

Todas as etapas mostram valores em verde como se fossem receita confirmada. Na realidade, "Carrinho Abandonado" e "Pix Gerado" representam **dinheiro perdido** -- devem aparecer em vermelho/negativo.

### Parte 1: Colorir receita por contexto (etapa de comprador vs. não-comprador)

**Lógica**: Precisamos saber quais etapas representam "venda confirmada". Proposta: usar o campo `page_type` já existente no `LeadFunnelStage` para classificar. Etapas com nomes contendo palavras-chave como "comprador", "venda", "cliente", "vip", "recorrente" ou `page_type = 'thankyou'` são tratadas como etapas de receita. As demais mostram o valor como "perdido" (vermelho, prefixo negativo).

Alternativa mais simples e flexível: adicionar um flag `is_revenue_stage` na configuração de etapas (checkbox "Esta etapa representa venda confirmada"). Porém isso exige migração de banco. Para evitar isso, usamos heurística por nome + permitimos override via `metadata` do stage.

**Decisão**: Heurística por nome da etapa. Se o nome contém "comprador", "compra", "venda", "cliente", "vip", "recorrente", "aprovad" → receita confirmada (verde). Senão → valor perdido (vermelho, com label "perdido").

**Arquivos afetados**:

- `KanbanBoard.tsx`: Criar função `isRevenueStage(stageName)`. Colorir o valor no header da coluna (verde vs. vermelho). Separar `totalRevenue` em `confirmedRevenue` e `lostRevenue` no header global.
- `LeadCard.tsx`: Receber prop `isRevenue` do KanbanBoard para colorir o badge de valor individual (verde para comprador, vermelho/cinza para carrinho abandonado).

### Parte 2: Aba "Métricas" no funil

**Arquivo novo**: `src/components/lead-funnels/FunnelMetricsTab.tsx`

Recebe `stages` e `positions` como props. Exibe:

```text
┌──────────────────────────────────────────────────┐
│  KPI Cards (topo)                                │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────┐│
│  │ Total    │ │ Receita  │ │ Perdido  │ │Ticket││
│  │ Leads    │ │Confirmada│ │ (mesa)   │ │Médio ││
│  └──────────┘ └──────────┘ └──────────┘ └──────┘│
│                                                  │
│  Distribuição por Etapa (bar chart horizontal)   │
│  Comprador ████████████████████ 741 · R$ 35.9K   │
│  Pix Gerado ░ 0                                  │
│  Carrinho ░░ 6 · -R$ 409                         │
│                                                  │
│  Taxa de Conversão entre Etapas                  │
│  Carrinho → Pix → Comprador: X%                  │
└──────────────────────────────────────────────────┘
```

**Métricas calculadas**:
- Total de leads no funil
- Receita confirmada (soma dos leads em etapas de receita)
- Valor perdido (soma dos leads em etapas não-receita)
- Ticket médio (receita / leads compradores)
- Distribuição por etapa (contagem + valor)
- Taxa de conversão entre etapas adjacentes

**Arquivo editado**: `LeadFunnelDetail.tsx` — adicionar a aba `<TabsTrigger value="metrics">Métricas</TabsTrigger>` com o novo componente.

Reutiliza o `MetricCard` existente em `src/components/kpi/MetricCard.tsx` para os KPI cards.

### Resumo de mudanças

| Arquivo | Ação |
|---------|------|
| `KanbanBoard.tsx` | Adicionar `isRevenueStage()`, colorir receita verde/vermelho por coluna e no total global |
| `LeadCard.tsx` | Receber prop `isRevenue`, colorir badge de valor |
| `FunnelMetricsTab.tsx` | Novo componente com dashboard de métricas do funil |
| `LeadFunnelDetail.tsx` | Adicionar aba "Métricas" |

