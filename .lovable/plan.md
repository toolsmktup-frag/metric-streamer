# Mapeamento explícito de etapas no Funil Visão Geral

## O que muda pro usuário

Hoje o Visão Geral só mostra leads de funis agregados quando o **nome da etapa é idêntico**. Como cada funil filho tem suas próprias etapas (Articulabem ≠ SuperVita), nada aparece.

Vamos adicionar um **"de-para" de etapas**: para cada funil agregado, você escolhe manualmente qual etapa dele cai em qual coluna do Visão Geral. Etapas não-mapeadas simplesmente não aparecem (com opção futura de "Outros").

### Fluxo de uso

1. No Visão Geral → **Configuração → Integrações → Campanhas agregadas**, marca as campanhas (como já faz hoje).
2. Logo abaixo, aparece um bloco novo **"Mapeamento de etapas"**, agrupado por funil de origem:
   ```text
   ─ SuperVita ─────────────────────────
     Lead novo        → [Novos       ▼]
     Em contato       → [Atendimento ▼]
     Venda fechada    → [Ganho       ▼]
     Sem interesse    → [— Ignorar — ]
   
   ─ Articulabem ───────────────────────
     Captura          → [Novos       ▼]
     ...
   ```
3. Salva. O Kanban do Visão Geral passa a mostrar os leads nas colunas certas, independente de como cada funil filho nomeou suas etapas.

**Fallback automático:** se o usuário não configurou o mapeamento ainda, mantemos o comportamento atual de casar por nome (case-insensitive) — assim quem já padronizou nomes continua funcionando sem reconfigurar.

## Detalhes técnicos

### Nova tabela (migration manual)

```sql
CREATE TABLE public.lead_funnel_stage_mappings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  target_funnel_id uuid NOT NULL REFERENCES public.lead_funnels(id) ON DELETE CASCADE,
  source_stage_id  uuid NOT NULL REFERENCES public.lead_funnel_stages(id) ON DELETE CASCADE,
  target_stage_id  uuid NOT NULL REFERENCES public.lead_funnel_stages(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  UNIQUE(target_funnel_id, source_stage_id)
);
CREATE INDEX idx_lfsm_target ON public.lead_funnel_stage_mappings(target_funnel_id);
ALTER TABLE public.lead_funnel_stage_mappings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "lfsm_all" ON public.lead_funnel_stage_mappings
FOR ALL TO authenticated
USING (EXISTS (SELECT 1 FROM public.lead_funnels lf
  WHERE lf.id = target_funnel_id AND lf.organization_id = public.get_user_org_id()))
WITH CHECK (EXISTS (SELECT 1 FROM public.lead_funnels lf
  WHERE lf.id = target_funnel_id AND lf.organization_id = public.get_user_org_id()));
```

Semântica: `target_funnel_id` = funil Visão Geral; `source_stage_id` = etapa do funil filho; `target_stage_id` = coluna do Visão Geral. UNIQUE garante que cada etapa de origem aponta pra um único destino.

### Hooks e tipos

- `src/hooks/useLeadFunnelStageMappings.ts` (novo): `useStageMappings(targetFunnelId)` e `useUpsertStageMappings(targetFunnelId, rows[])` (delete + insert).
- `src/hooks/useLeads.ts → useLeadsByFunnel`: substituir o `stageNameToIdMap` por um `sourceStageIdToTargetStageIdMap` quando houver mapeamento explícito; manter o fallback por nome quando o mapa estiver vazio.
- `src/pages/LeadFunnelDetail.tsx`: carrega `useStageMappings`, monta o mapa e passa pro `useLeadsByFunnel`.

### UI

- Novo componente `src/components/lead-funnels/StageMappingConfig.tsx`, renderizado em `FunnelConfigTab.tsx` logo abaixo do bloco de "Campanhas agregadas". Lista etapas dos funis agregados (via `useLeadFunnelStages`) e mostra um `<Select>` por linha com as etapas do funil destino + opção "— Ignorar —".

### Compatibilidade

- Mapeamento vazio → cai no comportamento atual (match por nome). Quem já tem padrão funcionando não precisa mexer.
- Funis dedicados (não-Visão-Geral) não são afetados — a tabela só é lida quando há campanhas agregadas.

## Arquivos afetados

- `docs/migration_lead_funnel_stage_mappings.sql` (novo — rodar manual)
- `src/hooks/useLeadFunnelStageMappings.ts` (novo)
- `src/hooks/useLeads.ts` (estender `useLeadsByFunnel`)
- `src/components/lead-funnels/StageMappingConfig.tsx` (novo)
- `src/components/lead-funnels/FunnelConfigTab.tsx` (incluir o novo bloco)
- `src/pages/LeadFunnelDetail.tsx` (carregar mapeamento + passar pro hook)

Nenhuma edge function precisa ser tocada.
