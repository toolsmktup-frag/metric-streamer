## Diagnóstico

A vendedora Gabi (e provavelmente as outras) está vendo conversas de instâncias que ela NÃO tem acesso. Causa raiz são 3 furos no controle de acesso:

### Furo 1 — Dropdown "Todas as instâncias" no chat unificado (CRÍTICO)

No `useWhatsAppMultiChat.ts`, quando o front chama `whatsapp-chats?instance_id=all`, o backend até filtra corretamente pela `whatsapp_instance_access` da vendedora. **MAS** o hook chama um RPC chamado `get_org_instance_labels` que retorna **TODAS as instâncias da organização** (ignora RLS — é `SECURITY DEFINER`). Isso é usado só pra montar o "badge" colorido com o nome da instância em cada conversa, mas tem dois efeitos colaterais:

1. Se o backend `whatsapp-chats` retornar uma conversa com `instance_id` que a vendedora NÃO deveria ver (ver Furo 2), o front tem o label e exibe normalmente, sem rejeitar.
2. O dropdown "Todas as instâncias" pode acabar listando instâncias indevidas (depende de onde vem a lista do filtro — preciso verificar).

### Furo 2 — `resolveLeadAccess` usa `assigned_to` para autorizar mensagens (CRÍTICO)

Na edge function `whatsapp-chats` (linhas 88-149), quando uma vendedora não-admin chama `list_chats`, o filtro de visibilidade da mensagem NÃO é só por `instance_id`. O fluxo é:

1. Busca últimas 300 mensagens onde `instance_id IN allowedInstanceIds` ✅
2. Mas depois roda `resolveLeadAccess` que filtra por **leads atribuídos à vendedora** (`assigned_to = user_id`)

O problema: na linha 296-298, se a vendedora **NÃO é admin**, ela só vê mensagens cujo lead está atribuído a ela OU cujo telefone bate com um lead atribuído a ela. Mas a Gabi pode ter `whatsapp_instance_access` para a instância "Gabi 2 - Equipe" e ao mesmo tempo um lead com aquele telefone está atribuído a OUTRA vendedora — nesse caso some. **PIOR**: leads sem `assigned_to` (null) e telefones sem lead cadastrado caem no filtro de telefone — se duas vendedoras têm acesso a instâncias diferentes mas o mesmo lead aparece em ambas, ambas veem.

Isso já estava acontecendo, mas o bug visível agora é:

### Furo 3 — Janela "Gerenciar Instâncias" lista TODAS as instâncias da org pra qualquer admin (esperado), MAS o checkbox "Acesso de Vendedores" salva sem validar org

Na print 2 vejo que a Luisa 0938 tem checkboxes pra Sarini, Daniela, Gabriela, rafa.colombo e Luisa. Os 2 últimos estão marcados. Olhando `Equipe.tsx` (linha 88-104) e `InstanceAccessManager.tsx`, o INSERT em `whatsapp_instance_access` não valida que o `instance_id` pertence à mesma organização do `user_id` que está sendo concedido. Combinado com RLS frouxa pode permitir cruzamento.

Mas o sintoma "instâncias se misturando" descrito pela Gabi é provavelmente o Furo 2 + uma situação onde a Gabi tem acesso a 2 instâncias (ex: "Gabi 1" e "Gabi 2") e as conversas estão aparecendo em ambas no dropdown "Todas as instâncias", com o badge mostrando uma instância errada — porque o `instance_id` retornado pelo backend é o correto, mas o front pode estar batendo no `globalMeta` que mistura nomes se houver instâncias duplicadas/renomeadas.

## O que fazer

### Passo 1 — Auditar primeiro (read-only)
Antes de mudar código, rodar 3 SELECTs no Supabase pra confirmar:

```sql
-- 1. Quais instâncias a Gabi tem acesso?
SELECT u.email, wi.name, wi.id, wia.created_at
FROM whatsapp_instance_access wia
JOIN auth.users u ON u.id = wia.user_id
JOIN whatsapp_instances wi ON wi.id = wia.instance_id
WHERE u.email ILIKE '%gabi%' OR u.email ILIKE '%gabriela%'
ORDER BY u.email, wi.name;

-- 2. Há acessos cruzados entre orgs? (não deveria ter)
SELECT wia.user_id, up.organization_id AS user_org,
       wi.organization_id AS inst_org, wi.name
FROM whatsapp_instance_access wia
JOIN user_profiles up ON up.id = wia.user_id
JOIN whatsapp_instances wi ON wi.id = wia.instance_id
WHERE up.organization_id <> wi.organization_id;

-- 3. Há instâncias com nomes duplicados na mesma org?
SELECT organization_id, lower(trim(name)) AS norm_name, COUNT(*), array_agg(id)
FROM whatsapp_instances
GROUP BY 1,2 HAVING COUNT(*) > 1;
```

### Passo 2 — Corrigir o backend `whatsapp-chats`

Na edge function `supabase/functions/whatsapp-chats/index.ts`, em `list_chats`:

- Para vendedoras não-admin, **remover** o filtro adicional por `assigned_to` no caminho do unified mode. O critério único deve ser: `instance_id ∈ allowedInstanceIds`. Quem tem acesso à instância vê todas as conversas dela. Se a regra é "vendedora só vê leads atribuídos a ela", isso precisa ser uma decisão do produto — hoje a regra está aplicada de forma inconsistente (não bloqueia no `messages` action por instance_id, mas filtra por lead).
- Garantir que tanto `list_chats` quanto `messages` apliquem **a mesma regra de visibilidade**.

### Passo 3 — Corrigir o front `useWhatsAppMultiChat.ts`

- Trocar `get_org_instance_labels` (que retorna toda a org) por uma versão que retorna **apenas as instâncias que o usuário tem acesso** (admin = todas, vendedora = via `whatsapp_instance_access`). Criar novo RPC `get_user_accessible_instance_labels()`.
- Após o merge, **descartar** qualquer chat cujo `instance_id` não esteja no mapa de instâncias acessíveis (defesa em profundidade no front).

### Passo 4 — Hardenar `whatsapp_instance_access`

Adicionar constraint/policy SQL pra garantir que `user_id.organization_id == instance_id.organization_id` no INSERT (previne cruzamento de org via UI).

### Passo 5 — Validar com a Gabi

Pedir pra ela recarregar e confirmar que só vê as conversas das instâncias marcadas no painel "Acesso de Vendedores".

## Arquivos afetados

- `supabase/functions/whatsapp-chats/index.ts` (deploy manual no Supabase Dashboard)
- `src/hooks/useWhatsAppMultiChat.ts`
- Novo SQL: `docs/sql/get_user_accessible_instance_labels.sql` (rodar no Supabase Dashboard)
- Novo SQL: hardening de `whatsapp_instance_access` (rodar no Supabase Dashboard)

## Perguntas antes de implementar

1. **Regra de produto**: vendedora com acesso à instância deve ver **todas** as conversas dessa instância, ou só as conversas dos leads atribuídos a ela? Hoje o código mistura as duas regras e gera o bug.
2. Posso seguir com o passo 1 (rodar os 3 SELECTs de auditoria) pra confirmar o diagnóstico antes de tocar no código?
