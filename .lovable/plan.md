# Funil de leads geral com seleção de campanhas

## O problema hoje

Cada **funil de leads** (`lead_funnels`) está amarrado a **uma única campanha** (`campaign_id`). Não dá pra ter um funil "Geral" que mostre, por exemplo, leads das campanhas A + C + E juntas num mesmo Kanban.

## Recomendação (best practice)

Transformar a relação funil ↔ campanha em **muitos-para-muitos**, mantendo `campaign_id` como "campanha primária" pra retrocompatibilidade. Isso permite:

- Criar um funil **"Visão Geral"** (ou quantos quiser) que agrega leads de N campanhas escolhidas a dedo.
- Manter funis dedicados por campanha como hoje (continuam funcionando).
- Atribuição de novos leads continua usando `campaign_id` (a "dona" da venda), e os funis adicionais só **espelham** a visualização.

Essa é a abordagem padrão pra CRM com múltiplas origens: separar **propriedade do dado** (campaign_id da venda) da **visibilidade em pipelines** (M:N).

### Alternativas consideradas

1. **Filtro client-side no Kanban** (selecionar campanhas e filtrar leads exibidos). Mais simples, mas é só uma view temporária — sem regras de automação, sem permissão por funil, sem persistência.
2. **Tags em vez de M:N**. Funciona, mas mistura conceitos (tag de lead vs. tag de funil) e dificulta permissão granular por funil.

**Vamos com a opção M:N**, que é a mais limpa e escala melhor.

## Como vai funcionar pro usuário

1. Na tela de criar/editar funil aparece um novo bloco **"Campanhas incluídas"** com multi-select de todas as `lead_campaigns` da org.
2. Marque "Visão Geral" como tipo e selecione as campanhas A, C, E → o Kanban desse funil passa a mostrar leads dessas 3 campanhas.
3. Funis existentes continuam intactos — automaticamente entram com a `campaign_id` atual já marcada no multi-select.

## Detalhes técnicos

**Migration nova (rodar manual no Supabase):**

```sql
CREATE TABLE public.lead_funnel_campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_funnel_id uuid NOT NULL REFERENCES public.lead_funnels(id) ON DELETE CASCADE,
  lead_campaign_id uuid NOT NULL REFERENCES public.lead_campaigns(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  UNIQUE(lead_funnel_id, lead_campaign_id)
);

CREATE INDEX idx_lfc_funnel ON public.lead_funnel_campaigns(lead_funnel_id);
CREATE INDEX idx_lfc_campaign ON public.lead_funnel_campaigns(lead_campaign_id);

ALTER TABLE public.lead_funnel_campaigns ENABLE ROW LEVEL SECURITY;

CREATE POLICY "lfc_all" ON public.lead_funnel_campaigns
FOR ALL TO authenticated
USING (EXISTS (SELECT 1 FROM public.lead_funnels lf
  WHERE lf.id = lead_funnel_campaigns.lead_funnel_id
    AND lf.organization_id = public.get_user_org_id()))
WITH CHECK (EXISTS (SELECT 1 FROM public.lead_funnels lf
  WHERE lf.id = lead_funnel_campaigns.lead_funnel_id
    AND lf.organization_id = public.get_user_org_id()));

-- Backfill: copia o campaign_id atual pra tabela nova
INSERT INTO public.lead_funnel_campaigns (lead_funnel_id, lead_campaign_id)
SELECT id, campaign_id FROM public.lead_funnels
WHERE campaign_id IS NOT NULL
ON CONFLICT DO NOTHING;
```

**Frontend:**

- `useLeadFunnels.ts` → na query incluir `lead_funnel_campaigns(lead_campaign_id)`. Quando buscar leads do funil, montar a lista de campanhas: `[funnel.campaign_id, ...funnel.lead_funnel_campaigns.map(...)]` (dedup) e filtrar `lead.metadata->>campaign_id` por `.in(...)`.
- Novo hook `useUpsertLeadFunnelCampaigns(funnelId, campaignIds[])` → delete + insert (mesmo padrão de `useUpsertFunnelProducts`).
- `LeadFunnelDetail.tsx` (ou modal de edição): adicionar bloco "Campanhas incluídas" com multi-select usando `useLeadCampaigns()`.
- Badge no header do funil mostrando quantas campanhas estão incluídas (ex: "3 campanhas").

**Compatibilidade:** `campaign_id` continua existindo e funcionando como campanha primária. Nada quebra; só ganha capacidade adicional.

## Arquivos afetados

- `docs/migration_lead_funnel_campaigns.sql` (novo — rodar manual)
- `src/hooks/useLeadFunnels.ts` (incluir relação + filtro multi-campanha)
- `src/hooks/useUpsertLeadFunnelCampaigns.ts` (novo)
- `src/types/leadFunnels.ts` (adicionar `lead_funnel_campaigns?: {...}[]`)
- `src/pages/LeadFunnelDetail.tsx` (UI multi-select + badge)
- `src/pages/LeadCampaigns.tsx` (badge "N campanhas" nos cards de funil, opcional)

Nenhuma edge function precisa ser tocada.
