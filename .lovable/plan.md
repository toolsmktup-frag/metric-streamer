
Diagnóstico: o erro da Guru não é do `checkout_url/page_url` em si; é um erro de sintaxe no arquivo. Conferi o `supabase/functions/guru-webhook/index.ts` atual e o bloco abaixo ficou aberto:

```ts
if (normalizedStatus === "authorized") {
  try {
    ...
  } catch (capiErr) {
    ...
  }

  // wz-receiver...
  if (normalizedStatus === "authorized" && productName) {
```

Falta fechar esse `if` do Meta CAPI antes do comentário `// wz-receiver...`. Por isso o bundler só “explode” no final do arquivo, em `});`.

Plano de correção:
1. Ajustar apenas `supabase/functions/guru-webhook/index.ts`.
2. Inserir uma chave `}` logo depois do `catch (capiErr)`.
3. Regenerar o documento consolidado, porque o `.txt` que você abriu provavelmente contém essa versão quebrada.
4. Fazer deploy somente da `guru-webhook` no Supabase. Não precisa rodar SQL de novo e não precisa redeploy da Ticto/Eduzz.

Trecho exato que precisa ficar assim:
```ts
      } catch (capiErr) {
        console.error("[guru-webhook] meta-capi-sync error (non-fatal):", capiErr);
      }
    }

    // wz-receiver forward already done at the top (before status filtering)

    // ── Stock deduction (apenas vendas aprovadas) ──
    if (normalizedStatus === "authorized" && productName) {
```

Impacto esperado:
- Corrige o erro de parse/bundle da função Guru.
- Mantém toda a lógica nova de `checkout_url` e `page_url`.
- Não exige nenhuma mudança adicional no banco.

Detalhe técnico:
```text
Estrutura quebrada:
if authorized {
  try/catch meta-capi
  if authorized && productName { ... }
  return ...
}

Estrutura correta:
if authorized {
  try/catch meta-capi
}
if authorized && productName { ... }
return ...
```
