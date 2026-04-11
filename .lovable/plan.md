

# Filtro inteligente de eventos duplicados nas regras de transição

## Contexto
A implementação atual esconde completamente um evento do dropdown se ele já foi usado em qualquer regra. Mas a lógica do banco (RPC v5) suporta múltiplas regras para o mesmo evento com `from_stage_id` diferentes — a regra específica tem prioridade sobre o catch-all.

## Nova lógica de filtro

Um evento deve ser **escondido** do dropdown de outra regra apenas se:
1. Já existe uma regra com `from_stage_id = NULL` ("Qualquer etapa") para esse evento — é catch-all, cobre tudo
2. OU já existe uma regra com a **mesma combinação** evento + from_stage_id específico

Em resumo: se o evento já tem um "Qualquer etapa", bloqueia. Se só tem etapas específicas, continua disponível.

Adicionalmente: quando o usuário seleciona "Qualquer etapa" para um evento que já tem regras com etapas específicas, mostrar um alerta ou remover automaticamente as regras específicas (já que o catch-all as sobrescreve).

## Alteração

**Arquivo**: `src/components/lead-funnels/FunnelConfigTab.tsx`

Substituir o filtro atual:
```tsx
.filter(e => {
  const usedByOther = localRules.some((r, i) => i !== idx && r.event_name === e.value);
  return !usedByOther;
})
```

Por:
```tsx
.filter(e => {
  // Esconder se outra regra já usa este evento com "Qualquer etapa" (catch-all)
  const hasCatchAll = localRules.some(
    (r, i) => i !== idx && r.event_name === e.value && !r.from_stage_id
  );
  return !hasCatchAll;
})
```

Também: quando o usuário muda `from_stage_id` para "Qualquer etapa" em uma regra, remover automaticamente outras regras do mesmo evento (já que o catch-all as torna redundantes). Adicionar essa lógica no `onValueChange` do select de `from_stage_id`:

```tsx
onValueChange={v => {
  const newFromStage = v === 'any' ? null : v;
  updateRule(idx, 'from_stage_id', newFromStage);
  // Se mudou para "Qualquer etapa", remover regras redundantes do mesmo evento
  if (newFromStage === null) {
    const eventName = localRules[idx].event_name;
    if (eventName) {
      setLocalRules(prev => prev.filter(
        (r, i) => i === idx || r.event_name !== eventName
      ));
    }
  }
}}
```

## Resultado
- Mesmo evento pode ter múltiplas regras com etapas de origem diferentes
- Se configurar "Qualquer etapa", as regras específicas daquele evento são removidas automaticamente
- Evento com catch-all some do dropdown das outras regras

