

## Plano: Linkar Funil de Tráfego na Campanha de Leads

### Contexto
Hoje o campo `traffic_funnel_id` existe apenas em `lead_funnels`. Isso obriga o usuário a associar funil por funil. A proposta é adicionar esse link também na **campanha** (`lead_campaigns`), para que todos os funis daquela campanha herdem automaticamente o funil de tráfego — mas permitindo override individual.

### Hierarquia de resolução
```text
Funil de Leads → traffic_funnel_id (override individual)
  ↑ herda se NULL
Campanha → traffic_funnel_id (padrão para todos os funis da campanha)
```

### Implementação

**1. Migration: adicionar `traffic_funnel_id` em `lead_campaigns`**
- `ALTER TABLE public.lead_campaigns ADD COLUMN IF NOT EXISTS traffic_funnel_id uuid REFERENCES public.funnels(id) ON DELETE SET NULL;`

**2. Tipo TypeScript**
- Em `src/types/leadFunnels.ts`, adicionar `traffic_funnel_id: string | null` em `LeadCampaign`.

**3. UI da Campanha (`src/pages/LeadCampaigns.tsx`)**
- No card/accordion de cada campanha, adicionar um dropdown para selecionar o funil de tráfego associado.
- Ao criar campanha, permitir já selecionar o funil de tráfego.
- Ao alterar, chamar `useUpdateLeadCampaign` (já existe no hook).

**4. Hook de update da campanha**
- `useUpdateLeadCampaign` em `useLeadCampaigns.ts` — já existe? Verificar. Se não, criar (padrão simples como `useUpdateLeadFunnel`).

**5. Resolução no Resumo/Dados**
- Onde o sistema usa `funnel.traffic_funnel_id`, aplicar fallback:
  `const trafficId = funnel.traffic_funnel_id ?? campaign?.traffic_funnel_id ?? null`
- Isso afeta principalmente `LeadFunnelDetail.tsx` e qualquer lugar que resolva o link de tráfego.

### Arquivos
- **Migration SQL** (doc para rodar no Supabase)
- `src/types/leadFunnels.ts` — adicionar campo em `LeadCampaign`
- `src/hooks/useLeadCampaigns.ts` — adicionar `useUpdateLeadCampaign` se não existir
- `src/pages/LeadCampaigns.tsx` — dropdown de funil de tráfego por campanha
- `src/pages/LeadFunnelDetail.tsx` — fallback para `campaign.traffic_funnel_id`

### Resultado
O usuário poderá associar "Articulabem (campanha)" ao funil de tráfego do Articulabem uma única vez, e todos os funis de leads dentro dessa campanha herdarão automaticamente — sem precisar configurar um por um.

