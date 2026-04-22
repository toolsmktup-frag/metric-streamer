

## Fix: 3 bugs no painel do contato (WhatsApp)

### 1. Erro `relation "user_roles" does not exist`

**Causa:** A RPC `ensure_lead_for_phone` tenta ler de `public.user_roles` como fallback, mas essa tabela **não existe** neste projeto (busquei: zero referências no código, só na própria SQL). O `EXCEPTION WHEN undefined_table` deveria capturar, mas em alguns cenários do Postgres o erro só é levantado no parse (não no runtime catch), estourando pra cima.

**Fix (SQL pra colar no Supabase):** remover o bloco de fallback. O `user_profiles` já é a fonte de verdade no app inteiro.

```sql
CREATE OR REPLACE FUNCTION public.ensure_lead_for_phone(
  p_phone text,
  p_name  text DEFAULT NULL
)
RETURNS public.leads
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id      uuid;
  v_user_id     uuid := auth.uid();
  v_role        text;
  v_digits      text;
  v_variations  text[];
  v_lead        public.leads;
  v_assign_to   uuid;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Não autenticado'; END IF;
  IF p_phone IS NULL OR length(trim(p_phone)) = 0 THEN
    RAISE EXCEPTION 'Telefone obrigatório';
  END IF;

  v_org_id := public.get_user_org_id();
  IF v_org_id IS NULL THEN RAISE EXCEPTION 'Usuário sem organização'; END IF;

  -- Role: APENAS user_profiles (fonte de verdade do app)
  SELECT role::text INTO v_role
  FROM public.user_profiles
  WHERE id = v_user_id
  LIMIT 1;

  v_role := COALESCE(v_role, 'vendedor');

  v_digits := regexp_replace(p_phone, '\D', '', 'g');
  v_variations := ARRAY[p_phone, v_digits, '+' || v_digits];
  IF v_digits LIKE '55%' AND length(v_digits) >= 12 THEN
    v_variations := v_variations || substring(v_digits FROM 3);
  ELSIF length(v_digits) BETWEEN 10 AND 11 THEN
    v_variations := v_variations || ('55' || v_digits) || ('+55' || v_digits);
  END IF;

  SELECT * INTO v_lead
  FROM public.leads
  WHERE organization_id = v_org_id AND phone = ANY(v_variations)
  ORDER BY created_at DESC
  LIMIT 1;

  IF FOUND THEN
    IF v_role NOT IN ('admin', 'gestor') AND v_lead.assigned_to IS NULL THEN
      UPDATE public.leads SET assigned_to = v_user_id, updated_at = now()
      WHERE id = v_lead.id RETURNING * INTO v_lead;
    END IF;
    RETURN v_lead;
  END IF;

  v_assign_to := CASE WHEN v_role NOT IN ('admin', 'gestor') THEN v_user_id ELSE NULL END;

  INSERT INTO public.leads (organization_id, phone, name, assigned_to, metadata)
  VALUES (
    v_org_id,
    COALESCE(NULLIF(v_digits, ''), p_phone),
    NULLIF(trim(coalesce(p_name, '')), ''),
    v_assign_to,
    jsonb_build_object('source', 'whatsapp_chat', 'created_via', 'whatsapp_contact_panel')
  )
  RETURNING * INTO v_lead;

  BEGIN
    INSERT INTO public.lead_events (lead_id, event_name, metadata)
    VALUES (v_lead.id, 'criado', jsonb_build_object('source', 'whatsapp_contact_panel'));
  EXCEPTION WHEN OTHERS THEN NULL; END;

  RETURN v_lead;
END;
$$;

GRANT EXECUTE ON FUNCTION public.ensure_lead_for_phone(text, text) TO authenticated;
```

Atualizar também `docs/sql/ensure-lead-and-tags.sql` no repo pra refletir a versão limpa (mesmo conteúdo).

### 2. Foto do contato não aparece no painel direito

**Causa:** `ContactPanel.tsx` linhas 161-163 sempre renderiza ícone `<User>` genérico. Nunca consumiu `profile_pic_url` da `whatsapp_contacts` nem reaproveitou o `contact_picture` que a lista já tem.

**Fix (frontend, sem mexer em DB):**
- Adicionar prop `contactPicture?: string | null` em `ContactPanel`.
- Passar do parent: `<ContactPanel ... contactPicture={selectedChat?.contact_picture} />`.
- Renderizar `<img>` quando existir, com fallback pro ícone.

```tsx
// ContactPanel header
<div className="h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center overflow-hidden">
  {contactPicture ? (
    <img src={contactPicture} alt="" className="h-full w-full object-cover" />
  ) : (
    <User className="h-8 w-8 text-primary" />
  )}
</div>
```

Buscar onde `<ContactPanel>` é instanciado e passar o `contact_picture` do chat selecionado.

### 3. "Lead..." truncado no banner verde (parecia que o nome foi editado)

**Causa:** O nome do contato **não foi editado** — o que aparece truncado é o título do banner *"Lead sem responsável"*, que com viewport estreito (568px no mobile do print) e `truncate` corta pra "Lead...". O nome real do contato segue correto no header ("Equipe Matheus Colombo").

**Fix (`ClaimLeadBanner.tsx`):**
- Trocar layout single-line por 2 linhas com `whitespace-normal leading-tight`.
- Reduzir tamanho do botão pra "Assumir" (ícone-only em telas estreitas seria opção, mas mantemos texto curto "Assumir").
- Garantir `min-w-0` correto e remover `truncate` da linha do título.

```tsx
<div className="flex-1 min-w-0">
  {isUnassigned ? (
    <>
      <p className="text-[11px] font-semibold text-foreground leading-tight">
        Lead sem responsável
      </p>
      <p className="text-[10px] text-muted-foreground leading-tight">
        Clique pra assumir
      </p>
    </>
  ) : (
    <>
      <p className="text-[11px] font-semibold text-foreground leading-tight truncate">
        Lead de <span className="text-primary">{ownerName}</span>
      </p>
      <p className="text-[10px] text-muted-foreground leading-tight">
        Somente leitura
      </p>
    </>
  )}
</div>
```

### O que precisa ser executado no Supabase

Apenas **1 SQL** (bloco `CREATE OR REPLACE FUNCTION` da seção 1 acima). Cole no SQL Editor e rode. É idempotente.

### Arquivos do app que vão mudar

- `src/components/whatsapp/ContactPanel.tsx` — adiciona prop `contactPicture` e renderiza foto no header.
- `src/components/whatsapp/ClaimLeadBanner.tsx` — ajusta layout do banner pra não truncar.
- Componente pai do `ContactPanel` (página WhatsApp) — passa `contact_picture` do chat selecionado.
- `docs/sql/ensure-lead-and-tags.sql` — atualiza pra versão sem fallback `user_roles`.

### Validação após aplicar
1. SQL aplicado → abrir chat de qualquer contato como vendedora → não dá mais erro `user_roles`.
2. Foto do WhatsApp aparece no header do painel direito (mesma da lista).
3. Banner "Assumir pra mim" aparece em 2 linhas legíveis, sem truncar feio em mobile.

