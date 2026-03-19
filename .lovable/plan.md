

## Plano: Integrar Controle de Acesso por Campanha/Funil

Os hooks e o componente `FunnelAccessManager` já foram criados. Agora falta:

1. **Rodar o SQL manualmente no Supabase SQL Editor** — criar a tabela e função
2. **Integrar o componente nas páginas existentes**
3. **Filtrar campanhas/funis para vendedores**

---

### 1. SQL para rodar no Supabase SQL Editor

Você precisa rodar este SQL no painel do Supabase antes de eu implementar o código:

```sql
-- Tabela de acesso
CREATE TABLE public.lead_funnel_access (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  campaign_id uuid REFERENCES public.lead_campaigns(id) ON DELETE CASCADE,
  funnel_id uuid REFERENCES public.lead_funnels(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL,
  created_at timestamptz DEFAULT now(),
  CONSTRAINT access_campaign_or_funnel CHECK (campaign_id IS NOT NULL OR funnel_id IS NOT NULL),
  UNIQUE (user_id, campaign_id, funnel_id)
);

ALTER TABLE public.lead_funnel_access ENABLE ROW LEVEL SECURITY;

-- Qualquer autenticado pode ver seus próprios acessos
CREATE POLICY "Users can view own access"
  ON public.lead_funnel_access FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- Admins/gestors podem ver todos da org
CREATE POLICY "Admins can view all org access"
  ON public.lead_funnel_access FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_profiles
      WHERE id = auth.uid() AND role IN ('admin', 'gestor')
      AND organization_id = lead_funnel_access.organization_id
    )
  );

-- Admins/gestors podem inserir
CREATE POLICY "Admins can insert access"
  ON public.lead_funnel_access FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_profiles
      WHERE id = auth.uid() AND role IN ('admin', 'gestor')
    )
  );

-- Admins/gestors podem deletar
CREATE POLICY "Admins can delete access"
  ON public.lead_funnel_access FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_profiles
      WHERE id = auth.uid() AND role IN ('admin', 'gestor')
    )
  );

-- Função SECURITY DEFINER para verificar acesso
CREATE OR REPLACE FUNCTION public.has_funnel_access(_user_id uuid, _funnel_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    -- Admin/gestor: acesso total
    EXISTS (
      SELECT 1 FROM public.user_profiles WHERE id = _user_id AND role IN ('admin', 'gestor')
    )
    OR
    -- Acesso direto ao funil
    EXISTS (
      SELECT 1 FROM public.lead_funnel_access WHERE user_id = _user_id AND funnel_id = _funnel_id
    )
    OR
    -- Acesso via campanha
    EXISTS (
      SELECT 1 FROM public.lead_funnel_access a
      JOIN public.lead_funnels f ON f.campaign_id = a.campaign_id
      WHERE a.user_id = _user_id AND f.id = _funnel_id AND a.funnel_id IS NULL
    )
$$;
```

---

### 2. Integrar FunnelAccessManager nas páginas (depois do SQL)

**`src/pages/LeadCampaigns.tsx`**
- Adicionar botão "Gerenciar Acesso" em cada campanha (ícone Users)
- Ao clicar, expandir/mostrar `FunnelAccessManager` com `campaignId` (acesso total à campanha)
- **Para vendedores**: filtrar a lista de campanhas/funis mostrando apenas aqueles com acesso

**`src/components/lead-funnels/FunnelConfigTab.tsx`**
- Adicionar seção `FunnelAccessManager` no final da aba de configuração, passando `funnelId` (acesso individual ao funil)
- Precisa receber `funnelId` como nova prop

**`src/pages/LeadFunnelDetail.tsx`**
- Passar `funnelId` para `FunnelConfigTab`
- Para vendedores sem acesso: verificar com `useHasFunnelAccess` e redirecionar se não tiver permissão

### 3. Filtrar listagem para vendedores

**`src/pages/LeadCampaigns.tsx`**
- Usar `useMyFunnelAccess()` + `useCurrentUserRole()`
- Se vendedor: filtrar `allFunnels` e `campaigns` para mostrar apenas itens com acesso
- Admins/gestores veem tudo normalmente

---

### Arquivos editados
| Arquivo | Mudança |
|---|---|
| `src/pages/LeadCampaigns.tsx` | Botão acesso + filtro vendedores |
| `src/components/lead-funnels/FunnelConfigTab.tsx` | Seção FunnelAccessManager |
| `src/pages/LeadFunnelDetail.tsx` | Passar funnelId + verificar acesso |

