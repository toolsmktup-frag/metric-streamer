

## Adicionar tempo entre eventos na Timeline

### O que muda

**`src/components/lead-funnels/LeadTimeline.tsx`** — Seção de Timeline (linhas 236-281)

Entre cada evento, calcular e exibir o tempo decorrido desde o evento anterior. O layout segue o print de referência:

```text
● Lead cadastrado                    08/11/24, 08:04
  via import

● Compra: Apostilas do Erveiro       08/11/24, 08:04
  ⏱ +0min
  R$ 27,44 · eduzz

● Compra: Apostilas do Erveiro       10/12/24, 09:03
  ⏱ +32d 0h 59min
  R$ 27,44 · eduzz
```

### Lógica

- Os eventos já estão ordenados cronologicamente (do mais recente para o mais antigo, `sortedEvents`)
- Para cada evento `i`, calcular `diff = eventDate[i-1] - eventDate[i]` (lembrando que a lista está em ordem decrescente, então o "anterior" cronologicamente é `i+1`)
- Formatar o diff como `+Xd Xh Xmin` (omitindo partes zeradas, ex: se < 1 dia, mostrar apenas horas/min)
- Exibir com ícone `Clock` em texto `text-muted-foreground` abaixo da data

### Formato do delta

```typescript
function formatTimeDelta(ms: number): string {
  const minutes = Math.floor(ms / 60000);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  const remHours = hours % 24;
  const remMinutes = minutes % 60;
  
  if (days > 0) return `+${days}d ${remHours}h ${remMinutes}min`;
  if (hours > 0) return `+${hours}h ${remMinutes}min`;
  return `+${remMinutes}min`;
}
```

### Também melhorar o label do evento

Para eventos de compra, mostrar o nome do produto no título (ex: "Compra: Nome do Produto") em vez de apenas "Compra", usando `ev.metadata.product_name`.

### Arquivo alterado

| Arquivo | Alteração |
|---------|-----------|
| `src/components/lead-funnels/LeadTimeline.tsx` | Adicionar delta de tempo entre eventos, melhorar label com nome do produto |

