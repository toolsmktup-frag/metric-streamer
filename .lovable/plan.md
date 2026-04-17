
## Diagnóstico
Quando vendedora cria uma instância via edge function `whatsapp-instance` (action `create_instance`):
1. ✅ Cria na UAZAPI
2. ✅ Insere em `whatsapp_instances`
3. ❌ **NÃO** insere em `whatsapp_instance_access` pra ela mesma

Resultado: vendedora cria, instância existe no banco, mas o filtro em `useWhatsApp.ts` (linha 102-114) só mostra instâncias que estão em `whatsapp_instance_access`. Como não tem registro, o array volta vazio → instância some pra ela.

Admin vê porque o filtro é pulado pra `role === 'admin' || 'gestor'`.

## Correção

**1. Edge function `supabase/functions/whatsapp-instance/index.ts`** — após o INSERT em `whatsapp_instances` (linha ~157), adicionar:

```ts
// Auto-grant access to the creator (so vendedora vê a instância que ela criou)
await supabase.from('whatsapp_instance_access').insert({
  user_id: userData.user.id,
  instance_id: newInstance.id,
  organization_id: profile.organization_id,
});
```

Roda com service role (já é o `supabase` admin client da function), então passa pela RLS sem problema.

**2. RLS — `whatsapp_instance_access`**
A policy atual de INSERT (`docs/whatsapp-instance-access.sql`) só permite admin. A edge function usa service role, então passa. Não precisa mexer.

**3. Backfill (opcional, mas recomendado)** — SQL pra rodar uma vez no Supabase, dando acesso retroativo a quem criou instâncias antes do fix:
- Como `whatsapp_instances` não tem `created_by`, o backfill manual exige você escolher caso a caso. Alternativa: rodar um script que dá acesso a todas as vendedoras das instâncias órfãs (pode ser feito pela tela `/equipe` que já existe).
- Pra o caso atual da Gabi: você abre Gerenciar Instâncias → seleciona a "Gabi 2" → marca a Gabi no painel de acessos. Resolve hoje.

## Arquivos alterados
- `supabase/functions/whatsapp-instance/index.ts` — +5 linhas após o insert

## Validação
1. Logar como vendedora → criar nova instância "teste-vendedora"
2. Conferir que aparece na lista dela imediatamente (sem precisar admin marcar)
3. Logar como admin → abrir gerenciar acessos da nova instância → confirmar que a vendedora já está marcada
4. Pra Gabi 2 que já existe: admin marca manualmente em `/equipe` ou no painel de acessos da instância
