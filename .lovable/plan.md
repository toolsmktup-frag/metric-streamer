

# Filtrar eventos já usados no dropdown de regras de transição

## Problema
O dropdown de eventos canônicos mostra todas as opções mesmo quando um evento já foi atribuído a outra regra. Isso permite criar regras duplicadas para o mesmo evento, causando conflitos e confusão.

## Solução
Filtrar os `CANONICAL_EVENTS` no dropdown de cada regra para esconder eventos já selecionados em outras regras. O evento da regra atual continua visível (para que o usuário possa ver o que selecionou).

## Alteração

**Arquivo**: `src/components/lead-funnels/FunnelConfigTab.tsx`

Na renderização do `<SelectContent>` das regras (linha ~266), substituir:

```tsx
{CANONICAL_EVENTS.map(e => (
  <SelectItem key={e.value} value={e.value}>{e.label}</SelectItem>
))}
```

Por:

```tsx
{CANONICAL_EVENTS
  .filter(e => {
    // Mostrar se: é o evento desta regra OU não está usado em nenhuma outra regra
    const usedByOther = localRules.some((r, i) => i !== idx && r.event_name === e.value);
    return !usedByOther;
  })
  .map(e => (
    <SelectItem key={e.value} value={e.value}>{e.label}</SelectItem>
  ))
}
```

Isso garante que cada evento canônico só pode ser usado em uma regra por vez. A opção "Outro (personalizado)" continua sempre visível.

