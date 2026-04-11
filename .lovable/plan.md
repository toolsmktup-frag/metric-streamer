
# Fix: Regras de transição não persistem

## Diagnóstico
Pelo snapshot atual, o funil está sendo carregado com `stage_transition_rules: []`, então o problema não parece ser só visual: as regras não estão voltando no fetch.

No código atual há 3 pontos frágeis:
1. `src/components/lead-funnels/FunnelConfigTab.tsx` reseta `localRules` sempre que `rules` muda (`useEffect`), o que pode apagar edição local.
2. O save aceita `from_stage_id` / `to_stage_id` temporários (`temp-*`) se a regra for criada antes de a etapa estar persistida.
3. `src/hooks/useLeadFunnels.ts` apaga e reinsere regras, mas não reconcilia imediatamente o cache do `lead-funnel`; se houver falha na reinserção, a tela volta vazia.

## Implementação
1. Ajustar a sincronização de `localRules`
- Trocar o reset cego por comparação estável (`id + event_name + from_stage_id + to_stage_id`).
- Só atualizar `localRules` quando o payload vindo do servidor realmente mudar.

2. Bloquear save com etapas temporárias
- Validar `from_stage_id` e `to_stage_id` antes de salvar.
- Se existir `temp-*`, impedir o save com mensagem clara: “Salve as etapas antes de salvar as regras”.

3. Tornar o save robusto
- Em `useUpsertTransitionRules`, checar erro no `delete`.
- Após o `insert`, atualizar o cache de `['lead-funnel', funnelId]` com as regras retornadas e depois invalidar a query para revalidação.

4. Melhorar feedback de erro
- Propagar a mensagem real do Supabase no save de regras para diferenciar:
  - etapa ainda não salva,
  - constraint/FK inválida,
  - permissão/RLS.

## Arquivos
- `src/components/lead-funnels/FunnelConfigTab.tsx`
- `src/hooks/useLeadFunnels.ts`

## Detalhes técnicos
- Chave de comparação sugerida:
  `rules.map(r => [r.id ?? 'new', r.event_name ?? '', r.from_stage_id ?? 'any', r.to_stage_id ?? ''].join(':')).join('|')`
- O update de cache deve preservar o restante do objeto `lead-funnel` e trocar apenas `stage_transition_rules`.
- A regra de negócio atual continua: o mesmo evento pode existir mais de uma vez quando muda a etapa de origem; o ajuste é só de persistência e estabilidade da tela.
