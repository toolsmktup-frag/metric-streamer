

## Problema

O SQL do `whatsapp_instance_access` usa `public.has_role(auth.uid(), 'admin')`, mas essa função **não existe** no seu banco. O projeto usa `public.get_user_role()` que retorna o role do usuário logado (sem parâmetros).

## Correção

Trocar todas as chamadas de `has_role(auth.uid(), 'admin')` por `get_user_role() = 'admin'` no SQL e no arquivo `docs/whatsapp-instance-access.sql`.

### SQL corrigido para rodar:

```sql
CREATE TABLE IF NOT EXISTS public.whatsapp_instance_access (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  instance_id uuid NOT NULL REFERENCES public.whatsapp_instances(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  UNIQUE(user_id, instance_id)
);

ALTER TABLE public.whatsapp_instance_access ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own access"
  ON public.whatsapp_instance_access FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.get_user_role() = 'admin');

CREATE POLICY "Admins can insert access"
  ON public.whatsapp_instance_access FOR INSERT TO authenticated
  WITH CHECK (public.get_user_role() = 'admin');

CREATE POLICY "Admins can delete access"
  ON public.whatsapp_instance_access FOR DELETE TO authenticated
  USING (public.get_user_role() = 'admin');

CREATE INDEX idx_whatsapp_instance_access_user ON public.whatsapp_instance_access(user_id);
CREATE INDEX idx_whatsapp_instance_access_instance ON public.whatsapp_instance_access(instance_id);
CREATE INDEX idx_whatsapp_instance_access_org ON public.whatsapp_instance_access(organization_id);
```

### Arquivo a atualizar

`docs/whatsapp-instance-access.sql` — substituir as 3 ocorrências de `public.has_role(auth.uid(), 'admin')` por `public.get_user_role() = 'admin'`.

