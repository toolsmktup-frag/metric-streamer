# Múltiplos funis de tráfego por funil de lead

## Resumo

Hoje cada funil de lead (e cada campanha de lead) referencia **um único** funil de tráfego via `traffic_funnel_id`. A proposta é permitir vincular **N funis de tráfego** ao mesmo funil de lead (ex: Infoprodutos ← Guia das Tinturas + Mestre das Tinturas).

## Onde o link é usado hoje

1. `ImportFromTrafficFunnelDialog` — pré-seleciona o funil de tráfego para importar vendas (`v_all_sales.funnel_id = X`) e leads via UTM das campanhas Meta daquele funil.
2. `LeadFunnelDetail` — passa `currentTrafficFunnelId` como default para o dialog acima.
3. UI em `LeadCampaigns` — select único para escolher o tráfego vinculado.

**Não há** cálculo de ROI/KPI que dependa desse `traffic_funnel_id` em runtime — é só atribuição/default de importação. Isso reduz muito o risco.

## Causa algum bug?

Não, desde que a gente:
- mantenha a coluna `traffic_funnel_id` (1:1) como fallback/legado e adicione uma tabela M:N nova;
- no dialog de import, ao escolher "todos vinculados", faça `.in('funnel_id', [...ids])` em vez de `.eq(...)` — `v_all_sales` e `meta_campaigns` já suportam isso.

Único cuidado: deduplicar leads/vendas quando os funis de tráfego têm vendas sobrepostas (mesma `transaction_id`/email). A lógica de import atual já deduplica por email + transaction, então segue OK.

## Proposta

### 1. Schema (migration manual, igual padrão do projeto)

Nova tabela M:N espelhando `lead_funnel_campaigns`:

```sql
CREATE TABLE public.lead_funnel_traffic_funnels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_funnel_id uuid NOT NULL REFERENCES public.lead_funnels(id) ON DELETE CASCADE,
  traffic_funnel_id uuid NOT NULL REFERENCES public.funnels(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  UNIQUE(lead_funnel_id, traffic_funnel_id)
);
-- + índices + RLS por organization_id (mesmo padrão de lead_funnel_campaigns)
-- Backfill: replica traffic_funnel_id atual para a M:N
```

Também criar `lead_campaign_traffic_funnels` se quiser o mesmo no nível campanha (opcional — pode ficar pra fase 2).

Manter `lead_funnels.traffic_funnel_id` como "principal" (compat).

### 2. Frontend

- **`LeadCampaigns.tsx`**: trocar o `Select` único do tráfego por um multi-select (chips). O primeiro selecionado vira o `traffic_funnel_id` "principal" (compat); os demais vão para a M:N. Manter opção "Ignorar".
- **`useLeadFunnels` / `useLeadCampaigns`**: incluir `lead_funnel_traffic_funnels(traffic_funnel_id)` no select.
- **`ImportFromTrafficFunnelDialog`**: aceitar `currentTrafficFunnelIds: string[]`. Renderizar checkbox list dos vinculados (default: todos marcados) + opção "outro funil". `fetchAllSales` e `fetchLeadsByUtm` passam a usar `.in('funnel_id', ids)`.
- **`LeadFunnelDetail`**: montar a lista combinando `funnel.traffic_funnel_id` + entradas da M:N (respeitando `ignore_traffic_funnel`).

### 3. Sem mudanças em

- Webhooks, edge functions, sync de vendas — nada depende dessa associação em runtime.
- Cálculos de LTV/RFM/ROI — usam `v_all_sales` por produto/UTM, não por essa FK.

## Riscos

- **Baixo**. O link é apenas para UX de importação. Vendas duplicadas já são deduplicadas por `transaction_id`/email no pipeline de import.
- Atenção visual: mostrar claramente quais funis estão agregados para o usuário não se confundir com o que tá puxando.

## Entregáveis

1. Migration SQL em `docs/migration_lead_funnel_traffic_funnels.sql` (rodar manual no Dashboard).
2. Update dos hooks (`useLeadFunnels`, `useLeadCampaigns`) e tipos.
3. UI multi-select em `LeadCampaigns.tsx`.
4. `ImportFromTrafficFunnelDialog` aceitando múltiplos IDs.
5. `LeadFunnelDetail` passando array.
