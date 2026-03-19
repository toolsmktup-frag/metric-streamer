

## Plano: Sistema de Recontato por Produto com Contagem Regressiva

### Contexto

O usuário vende suplementos em potes (1 pote, 3 potes, 6 potes de ArticulaBEM). Cada quantidade dura um número diferente de dias. Ele precisa saber quando entrar em contato com cada cliente para recompra, com priorização visual.

### Arquitetura

```text
┌─────────────────────────────┐
│   funnel_products (existente)│
│ + recontact_days (novo col)  │  ← ex: "1 pote" = 25 dias, "3 potes" = 75 dias
└──────────────┬──────────────┘
               │ match por product_name_contains
               ▼
┌─────────────────────────────┐
│   Lead Card / Base List      │
│ • Calcula: data_compra +     │
│   recontact_days = deadline  │
│ • Mostra contagem regressiva │
│ • Cor: verde/amarelo/vermelho│
└─────────────────────────────┘
```

### Alterações

**1. Migration: adicionar coluna `recontact_days` em `funnel_products`**
- `ALTER TABLE funnel_products ADD COLUMN recontact_days integer DEFAULT NULL`
- Quando preenchido (ex: 25), indica que após X dias da compra o cliente deve ser recontactado

**2. Atualizar `FunisConfigurar.tsx` (UI de configuração de produtos)**
- Adicionar campo numérico "Dias para Recontato" ao lado de cada produto
- Ex: "1 pote ArticulaBEM" → 25 dias, "3 potes" → 75 dias, "6 potes" → 150 dias

**3. Atualizar `useFunnels.ts` (tipo `FunnelProduct`)**
- Adicionar `recontact_days: number | null` ao tipo

**4. Criar hook `useRecontactDeadlines`**
- Recebe as positions (leads) e os funnel_products configurados
- Para cada lead, faz match do `product_name` (metadata) com `product_name_contains` do funnel_product
- Calcula: `deadline = purchased_at + recontact_days`
- Retorna `Map<leadId, { daysRemaining: number, isOverdue: boolean, deadlineDate: Date }>`

**5. Atualizar `LeadCard.tsx` — Badge de Recontato**
- Novo badge visual com contagem regressiva:
  - 🟢 Verde: > 7 dias restantes → "18d"
  - 🟡 Amarelo: 1-7 dias → "3d ⚠️"
  - 🔴 Vermelho: vencido → "-5d 🔥"
- Ícone de timer/alarme para destacar

**6. Atualizar `BaseLeadsList.tsx` — Coluna e Ordenação**
- Nova coluna "Recontato" na tabela com a contagem regressiva
- Novo critério de ordenação: por urgência (vencidos primeiro, depois por dias restantes crescente)
- Filtro rápido: "Mostrar apenas vencidos"

**7. Atualizar `KanbanBoard` — Passar dados de recontato para os cards**

### Lógica de cálculo

```text
purchased_at = lead.metadata.purchased_at (da planilha importada)
product_name = lead.metadata.product_name
recontact_days = funnel_product.recontact_days (onde product_name contém product_name_contains)
deadline = purchased_at + recontact_days
days_remaining = deadline - hoje
```

### Resultado esperado

- Na configuração do funil, o usuário define "1 pote = 25 dias", "3 potes = 75 dias"
- No Kanban e na lista, cada card mostra um badge colorido com contagem regressiva
- O time de vendas sabe imediatamente quem precisa ser contactado primeiro
- Ordenação por urgência permite priorizar os leads vencidos

