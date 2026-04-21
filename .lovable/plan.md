
## Plano de execução: desenhar o Funil com pernas separadas

O SQL da coluna `visual_parent_stage_id` já foi rodado, então não vou incluir nova alteração de banco. A implementação será só no código.

## Objetivo

Transformar a aba `Funil` de uma lista vertical linear para uma visualização em árvore, onde cada etapa pode escolher onde aparece visualmente.

Exemplo esperado:

```text
Novo Lead
├── Entrou no Grupo
│   └── Dia 01
│       └── Dia 02
│           └── Dia 03
└── Não entrou no grupo
    └── Saiu do Grupo
```

A conversão continua usando a configuração já criada:

```text
Base de conversão
```

E o desenho passa a usar a nova configuração:

```text
Aparece depois de
```

## Alterações que vou fazer

### 1. Atualizar o tipo da etapa

Em `src/types/leadFunnels.ts`, adicionar:

```ts
visual_parent_stage_id: string | null;
```

Isso permite o frontend reconhecer a nova coluna do Supabase.

### 2. Salvar o pai visual no Supabase

Em `src/hooks/useLeadFunnels.ts`, atualizar o salvamento das etapas para persistir:

```ts
visual_parent_stage_id: s.visual_parent_stage_id || null
```

Tanto no `update` de etapas existentes quanto no `insert` de novas etapas.

### 3. Adicionar seletor “Aparece depois de”

Em `src/components/lead-funnels/SortableStageItem.tsx`, adicionar um segundo seletor além do atual “Base de conversão”.

Ficará assim:

```text
Base de conversão
- define o cálculo da porcentagem

Aparece depois de
- define onde a etapa entra no desenho
```

Opções:

```text
Raiz / sem pai
Novo Lead
Entrou no Grupo
Não entrou no grupo
Saiu do Grupo
Dia 01
Dia 02
...
```

Com proteções:

- não permitir uma etapa apontar para ela mesma;
- não listar etapas temporárias ainda não salvas;
- se a etapa ainda não tiver ID, deixar o seletor desabilitado até salvar.

### 4. Refatorar o desenho do `FunnelVisual`

Em `src/components/lead-funnels/FunnelVisual.tsx`, trocar o render linear atual por uma árvore.

Nova lógica:

```text
1. Ordenar etapas por sort_order.
2. Criar mapa de stage_id → etapa.
3. Criar mapa de parent_id → filhos.
4. Usar visual_parent_stage_id como conexão principal.
5. Etapas sem pai viram raízes.
6. Se não houver nenhuma configuração visual ainda, manter fallback linear para não quebrar funis antigos.
7. Renderizar filhos lado a lado quando uma etapa tiver mais de um caminho.
```

A largura das caixas continua baseada em `Passaram`.

A porcentagem continua baseada em:

```ts
conversion_base_stage_id || etapa anterior
```

Ou seja:

```text
visual_parent_stage_id = desenho
conversion_base_stage_id = cálculo
```

### 5. Melhorar a leitura visual

No card de cada etapa, manter:

```text
Nome da etapa
Atual: X
Passaram: Y
```

E exibir a conversão com tooltip indicando a base:

```text
72,5%
Base: Entrou no Grupo
```

Para ramificações, o layout será responsivo:

- desktop: ramos lado a lado;
- telas menores: ramos quebram em coluna para não estourar a tela.

### 6. Ajustar a aba Métricas

Em `src/components/lead-funnels/FunnelMetricsTab.tsx`, manter o cálculo pela base de conversão, mas deixar mais explícito:

```text
Entrou no Grupo → Dia 01
Base: Entrou no Grupo
Taxa: 35,2%
```

Assim fica claro que a árvore visual e a base matemática são coisas diferentes.

## Como você vai configurar depois

Depois da implementação, na aba `Configuração`, para o seu caso:

```text
Novo Lead
Aparece depois de: Raiz

Entrou no Grupo
Aparece depois de: Novo Lead
Base de conversão: Novo Lead

Não entrou no grupo
Aparece depois de: Novo Lead
Base de conversão: Novo Lead

Saiu do Grupo
Aparece depois de: Não entrou no grupo ou Entrou no Grupo
Base de conversão: Novo Lead ou Entrou no Grupo

Dia 01
Aparece depois de: Entrou no Grupo
Base de conversão: Entrou no Grupo

Dia 02
Aparece depois de: Dia 01
Base de conversão: Entrou no Grupo

Dia 03
Aparece depois de: Dia 02
Base de conversão: Entrou no Grupo
```

## Validação

Depois de implementar, vou validar:

```text
1. Build/TypeScript sem erro.
2. O seletor “Aparece depois de” aparece na configuração.
3. O valor é salvo e recarrega corretamente.
4. A aba Funil abre em pernas separadas.
5. A porcentagem continua usando “Base de conversão”.
6. Funis antigos sem visual_parent_stage_id continuam funcionando em modo linear.
```

## Arquivos que serão alterados

```text
src/types/leadFunnels.ts
src/hooks/useLeadFunnels.ts
src/components/lead-funnels/SortableStageItem.tsx
src/components/lead-funnels/FunnelVisual.tsx
src/components/lead-funnels/FunnelMetricsTab.tsx
```
