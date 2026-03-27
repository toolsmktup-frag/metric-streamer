

## Plano: Corrigir erro `.catch is not a function` na importação

### Problema
O `supabase.rpc()` retorna um `PromiseLike` (thenable do PostgREST), que não possui método `.catch()`. Isso causa o erro `(intermediate value).rpc(...).catch is not a function`.

### Solução
No arquivo `src/hooks/useImportLeads.ts`, linha 409-427, envolver a chamada `.rpc()` com `Promise.resolve()` para convertê-la em uma Promise real que possui `.catch()`.

### Arquivo: `src/hooks/useImportLeads.ts`

**Linha 408-428** - Alterar de:
```typescript
syncPromises.push(
  (supabase as any).rpc('sync_lead_from_sale', { ... })
    .catch((err: unknown) => console.error(...))
);
```

Para:
```typescript
syncPromises.push(
  Promise.resolve(
    (supabase as any).rpc('sync_lead_from_sale', { ... })
  ).catch((err: unknown) => console.error(...))
);
```

### Resultado
A importação dos 273 leads processará corretamente, sincronizando com BASE DE LEADS sem erro de runtime.

