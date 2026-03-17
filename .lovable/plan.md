

## Deploy da Edge Function `webhook-lead`

### Situação atual
O código da edge function já existe em `supabase/functions/webhook-lead/index.ts` e a configuração está em `supabase/config.toml` com `verify_jwt = false`.

### Problema
Não tenho acesso direto a uma ferramenta de deploy de edge functions neste momento. O deploy precisa ser feito de uma das seguintes formas:

### Opções de deploy

**Opção 1 — Via Supabase Dashboard (mais simples)**
1. Acesse o Supabase Dashboard → **Edge Functions**
2. Crie uma nova function chamada `webhook-lead`
3. Cole o conteúdo do arquivo `supabase/functions/webhook-lead/index.ts`
4. Desabilite a verificação de JWT

**Opção 2 — Via Supabase CLI (terminal local)**
```
supabase functions deploy webhook-lead --project-ref emfbocpmphtftqcezaib
```

### Após o deploy
Teste com o curl de exemplo:
```
curl -X POST "https://emfbocpmphtftqcezaib.supabase.co/functions/v1/webhook-lead" \
  -H "Content-Type: application/json" \
  -H "X-Funnel-Token: SEU_TOKEN_AQUI" \
  -d '{"event":"signup","phone":"+5511999999999","name":"Teste"}'
```

### Próximo passo
Sair do modo de planejamento e fazer qualquer ajuste necessário no código, ou te guiar pelo deploy manual.

