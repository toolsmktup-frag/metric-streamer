
## Sugestão: separar “estoque atual” de “histórico de passagem”

Sim, amiga: hoje o funil está misturando conceitos.

O número que aparece agora é “leads atuais em cada etapa”, vindo da tabela `lead_stage_positions`. Isso responde:

> “Quantos leads estão parados aqui agora?”

Mas para conversão real, principalmente nesse caso:

```text
Novo Lead: 5 atuais
Entrou no Grupo: 513 atuais
```

isso quebra a leitura, porque a etapa anterior deixou de ter os leads depois que eles avançaram. A conversão não deveria usar o estoque atual da etapa anterior, e sim o total histórico que passou por ela.

O ideal é ter dois tipos de métrica:

```text
1. Atual
   Leads que estão nessa etapa agora.

2. Passaram
   Leads únicos que já passaram por essa etapa em algum momento.
```

## Como ficaria na tela

Na aba “Funil”, cada etapa poderia mostrar:

```text
Novo Lead
Atual: 5
Passaram: 708

Entrou no Grupo
Atual: 513
Passaram: 513
Conversão histórica: 72,5%

Não entrou no grupo
Atual: 190
Passaram: 190
Conversão histórica: 26,8%
```

Assim você mantém a visão operacional do Kanban e ganha uma visão de performance real.

## Regra de cálculo proposta

### Leads atuais

Continua igual:

```text
lead_stage_positions.stage_id = etapa atual
```

### Leads que passaram

Calcular a partir de eventos de movimentação em `lead_events`, usando:

```text
metadata.to_stage_id
metadata.from_stage_id
event_name = 'stage_change'
event_name = 'whatsapp_group_sync'
```

Além disso, para garantir que o histórico não fique incompleto, também considerar a posição atual como passagem pela etapa atual.

### Conversão histórica

A conversão entre etapas deve usar:

```text
passaram_na_etapa_atual / passaram_na_etapa_anterior
```

Não mais:

```text
leads_atuais_na_etapa_atual / leads_atuais_na_etapa_anterior
```

Isso evita conversões absurdas tipo 10.000%.

## Ajustes técnicos

### 1. Criar hook para métricas históricas

Criar algo como:

```text
useFunnelStageHistoryCounts(funnelId)
```

Ele vai buscar eventos do funil em `lead_events` e montar:

```ts
{
  currentCounts: Record<string, number>;
  historicalCounts: Record<string, number>;
}
```

Com deduplicação por lead, para um lead que passou 3 vezes pela mesma etapa contar só 1 vez naquela etapa.

### 2. Atualizar `FunnelVisual`

Hoje o componente recebe só:

```ts
leadCounts
```

Vou alterar para receber também:

```ts
historicalCounts
metricMode
```

E exibir os dois números dentro do card da etapa.

Exemplo visual:

```text
┌─────────────────────────────┐
│ Entrou no Grupo             │
│ Atual: 513                  │
│ Passaram: 513               │
└─────────────────────────────┘
          72,5%
```

### 3. Usar histórico para largura e conversão

Na visualização do funil:

- a largura das barras deve usar “Passaram”
- a conversão lateral deve usar “Passaram”
- o número “Atual” aparece como informação complementar

Isso transforma a aba “Funil” em leitura de performance, não só de estoque.

### 4. Manter Kanban como visão operacional

O Kanban continua mostrando apenas leads atuais em cada etapa.

Não mudaria isso, porque no Kanban o importante é:

> “Onde estão os leads agora?”

### 5. Melhorar a aba “Métricas”

Na aba “Métricas”, atualizar “Distribuição por Etapa” para diferenciar:

```text
Atual na etapa
Passaram pela etapa
Conversão histórica
```

Assim a mesma lógica aparece tanto no gráfico de funil quanto no relatório.

## Atenção importante

O histórico depende da qualidade dos eventos já gravados.

Pelo código atual, movimentações manuais e sincronização de grupo já gravam `to_stage_id` em `lead_events`.

Mas alguns fluxos antigos ou webhooks podem ter movimentado leads sem gravar evento completo. Para evitar buraco, o cálculo vai sempre incluir também a posição atual.

Se quiser 100% de precisão retroativa, depois dá para criar uma rotina de backfill para gerar eventos históricos faltantes a partir de dados existentes, mas eu começaria sem isso.

## Resultado esperado

Depois do ajuste, você terá:

```text
Kanban = operação atual
Funil = performance histórica
Métricas = comparação entre atual, passaram e conversão real
```

E o exemplo que hoje parece quebrado deixa de ser interpretado como:

```text
513 / 5 = 10.260%
```

e passa a ser algo do tipo:

```text
513 / 708 = 72,5%
```

que é a informação correta para tomada de decisão.
