

## Fix: usar `user_profiles` na RPC

A RPC tentou ler de `profiles`, mas no projeto a tabela é `user_profiles` (vi em `docs/sql/approval_flow.sql`).

### Migration corrigida

```sql
CREATE OR REPLACE FUNCTION public.get_org_instance_labels()
RETURNS TABLE (id uuid, label text, created_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT i.id,
         COALESCE(NULLIF(i.nickname,''), NULLIF(i.display_name,''), i.instance_name, 'Instância'),
         i.created_at
  FROM whatsapp_instances i
  WHERE i.organization_id = (
    SELECT organization_id FROM user_profiles WHERE id = auth.uid()
  )
  ORDER BY i.created_at ASC;
$$;

GRANT EXECUTE ON FUNCTION public.get_org_instance_labels() TO authenticated;
```

E atualizar `src/hooks/useWhatsAppMultiChat.ts` pra chamar `supabase.rpc('get_org_instance_labels')` em vez do `.from('whatsapp_instances').select(...)`.

### Arquivos tocados

- `supabase/migrations/<new>.sql`
- `src/hooks/useWhatsAppMultiChat.ts`

### Resultado

Badge mostra o nome real de cada instância no modo "Todas as instâncias", inclusive pras instâncias que o vendedor não tem acesso direto via RLS.

