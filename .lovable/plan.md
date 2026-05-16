# Fix: "Ignorar funil de tráfego" quebra com erro

## Diagnóstico

Em `src/pages/LeadCampaigns.tsx` o seletor "🚫 Ignorar funil de tráfego" grava um UUID fake (`00000000-0000-0000-0000-000000000000`) na coluna `lead_funnels.traffic_funnel_id`.

Essa coluna é uma **foreign key** para `funnels(id)` (veja `docs/migration_traffic_funnel_link.sql`). Como esse UUID zero não existe na tabela `funnels`, o Postgres rejeita o update com violação de FK — daí o toast "Erro ao atualizar funil".

Resultado: clicar em "Ignorar" sempre falha, no caso do "Dia das Maes/26" e em qualquer outro funil/campanha.

## Solução

Trocar o sentinel UUID por uma coluna booleana dedicada `ignore_traffic_funnel`.

### Banco (SQL para rodar no Supabase Dashboard)

```sql
ALTER TABLE public.lead_funnels
  ADD COLUMN IF NOT EXISTS ignore_traffic_funnel boolean NOT NULL DEFAULT false;

ALTER TABLE public.lead_campaigns
  ADD COLUMN IF NOT EXISTS ignore_traffic_funnel boolean NOT NULL DEFAULT false;
```

### Frontend (`src/pages/LeadCampaigns.tsx`)

- Remover constante `IGNORE_FUNNEL_ID`.
- No `<select>` do funil:
  - `value` = `'__ignore__'` se `funnel.ignore_traffic_funnel`, senão `funnel.traffic_funnel_id || ''`.
  - Ao escolher `__ignore__`: chamar `updateLeadFunnel.mutateAsync({ id, ignore_traffic_funnel: true, traffic_funnel_id: null })`.
  - Ao escolher um funil real: `{ ignore_traffic_funnel: false, traffic_funnel_id: val }`.
  - Ao escolher vazio (herdar/sem): `{ ignore_traffic_funnel: false, traffic_funnel_id: null }`.
- Mesma lógica no `<select>` da campanha (linha 251).

### Tipos / hooks

- `src/types/leadFunnels.ts`: adicionar `ignore_traffic_funnel: boolean` em `LeadFunnel` e `LeadCampaign`.
- `useUpdateLeadFunnel` / `useUpdateLeadCampaign` já fazem spread, então só passa o campo novo.

### Atribuição de ROI (consumidores do traffic_funnel_id)

Pontos a revisar para respeitar o flag (qualquer leitura que faça "herdar da campanha quando funil é null"):
- `src/pages/LeadFunnelDetail.tsx:403` — usa `funnel.traffic_funnel_id ?? campaign?.traffic_funnel_id`. Precisa virar: se `funnel.ignore_traffic_funnel` → `null`; senão se `funnel.traffic_funnel_id` → usa; senão se `campaign.ignore_traffic_funnel` → `null`; senão `campaign.traffic_funnel_id`.
- Qualquer query de relatório que faça o mesmo "coalesce" (a buscar via grep antes de editar).

## Escopo

Apenas o fluxo "Ignorar funil de tráfego". Nenhuma alteração em webhooks, automações, ou outras telas.
