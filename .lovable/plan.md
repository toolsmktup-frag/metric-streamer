

## Diagnóstico + fix definitivo (2 RPCs faltando/quebradas)

### O que tá realmente acontecendo

1. **Botão "Assumir pra mim" → 404**: a RPC `public.assign_lead_to_seller` não existe no banco (PostgREST devolve `42P01`). O hook `useAssignLead` chama, falha, e a UI mostra a mensagem de erro antiga ("user_roles") que ficou em cache do toast anterior — confundindo o diagnóstico.
2. **Nome "Equipe Matheus Colombo"**: a UAZAPI grava `senderName` = nome da **instância** (não do contato) no payload de mensagens **outbound**. A edge `whatsapp-chats` propaga isso pra `contact_name`/`sender_name` da listagem, e a UI mostra. O nome real do contato (`wa_name: "Maria Cecilia"`) está no payload mas é ignorado.

### Plano de execução

**Passo 1 — Diagnóstico (eu rodo via tool de DB read-only, você não faz nada):**
- Listar todas as funções no schema `public` cujo nome contém `assign_lead` → ver se existe e qual assinatura.
- Listar todas as funções/policies que ainda mencionam `user_roles` → matar referências fantasma de uma vez.
- Confirmar memória `seller-assignment-logic` vs realidade do banco.

**Passo 2 — Migration única (via tool oficial, aprovação aparece pra você):**

```sql
-- (a) Recriar/criar assign_lead_to_seller limpa
CREATE OR REPLACE FUNCTION public.assign_lead_to_seller(
  p_lead_id uuid,
  p_assigned_to uuid
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_org_id  uuid := public.get_user_org_id();
  v_role    text;
  v_current uuid;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Não autenticado'; END IF;

  SELECT role::text INTO v_role FROM public.user_profiles WHERE id = v_user_id;
  v_role := COALESCE(v_role, 'vendedor');

  SELECT assigned_to INTO v_current
  FROM public.leads WHERE id = p_lead_id AND organization_id = v_org_id;

  IF NOT FOUND THEN RAISE EXCEPTION 'Lead não encontrado'; END IF;

  -- Vendedor só pode reivindicar lead órfão ou transferir pra si mesmo
  IF v_role NOT IN ('admin','gestor') THEN
    IF v_current IS NOT NULL AND v_current <> v_user_id AND p_assigned_to <> v_user_id THEN
      RAISE EXCEPTION 'Sem permissão para transferir este lead';
    END IF;
  END IF;

  UPDATE public.leads
     SET assigned_to = p_assigned_to, updated_at = now()
   WHERE id = p_lead_id;
END $$;

GRANT EXECUTE ON FUNCTION public.assign_lead_to_seller(uuid, uuid) TO authenticated;
```

- Se o diagnóstico achar `user_roles` em outras funções/policies, dropar/refatorar no mesmo migration.

**Passo 3 — Fix do nome (frontend + edge):**

- **`supabase/functions/whatsapp-chats/index.ts`**: ao montar `contact_name`, priorizar `payload.chat.wa_name` quando a mensagem é `fromMe: true` (porque `senderName` nesse caso é o nome da própria instância, não do contato). Fallback em ordem: `wa_name` → `contact.name` (se ≠ instância) → telefone formatado.
- **`src/components/whatsapp/ContactPanel.tsx`**: aplicar mesma lógica defensiva no header (já recebe lead — usar `lead.name` antes de `senderName`).
- **Migration opcional de limpeza**: `UPDATE leads SET name = NULL WHERE name IN (SELECT label FROM wz_instances WHERE organization_id = leads.organization_id)` — limpa leads já criados com nome poluído.

### O que você precisa fazer manualmente
**Nada.** Tudo via migration tool oficial + edits de arquivo. Aprovação aparece na UI.

### Validação final
1. Vendedora clica "Assumir pra mim" → sem 404, lead vira dela.
2. Header do painel mostra "Maria Cecilia" (do `wa_name`), não "Equipe Matheus Colombo".
3. Lista lateral também corrige nome em mensagens outbound.

