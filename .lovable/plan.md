

# Backfill: Aplicar regras de transição nos leads existentes

## Situação atual

As regras que você configurou estão corretas e vão funcionar para **novos eventos** que chegarem via webhook. A RPC `sync_lead_from_sale` v5 já consulta a tabela `stage_transition_rules` e move o lead automaticamente.

O problema é que os leads que já existem no funil (com eventos históricos já registrados em `lead_events`) **não foram reprocessados** — eles continuam na etapa onde estavam antes das regras existirem.

## O que vamos fazer

Criar e rodar uma migration SQL que reprocessa os leads existentes com base nos eventos históricos:

1. Para cada lead posicionado neste funil, buscar o **último evento** registrado em `lead_events`
2. Verificar se existe uma `stage_transition_rule` correspondente (evento + from_stage_id)
3. Se sim, mover o lead para a etapa de destino (`to_stage_id`)

Isso vai aplicar as regras retroativamente. Por exemplo, um lead que já teve evento `abandoned_cart` será movido para "Recuperar", e um que teve `purchase` vai para "Compra Aprovada".

## Detalhes técnicos

**Migration SQL** — um script único que:

```sql
-- Para cada lead no funil, pegar o evento mais recente
-- e aplicar a regra de transição correspondente
WITH latest_events AS (
  SELECT DISTINCT ON (le.lead_id)
    le.lead_id, le.event_name, lsp.id AS position_id, 
    lsp.stage_id AS current_stage, lsp.funnel_id
  FROM lead_events le
  JOIN lead_stage_positions lsp 
    ON lsp.lead_id = le.lead_id AND lsp.funnel_id = le.funnel_id
  WHERE le.funnel_id = '<FUNNEL_ID>'
  ORDER BY le.lead_id, le.created_at DESC
),
matched_rules AS (
  SELECT le.*, str.to_stage_id
  FROM latest_events le
  JOIN stage_transition_rules str
    ON str.funnel_id = le.funnel_id
   AND str.event_name = le.event_name
   AND (str.from_stage_id IS NULL OR str.from_stage_id = le.current_stage)
  WHERE str.to_stage_id <> le.current_stage
)
UPDATE lead_stage_positions lsp
SET stage_id = mr.to_stage_id, entered_at = NOW()
FROM matched_rules mr
WHERE lsp.id = mr.position_id;
```

- Será executado como migration via Supabase
- Preciso do ID do funil (vou buscar automaticamente pela rota atual: `19f75912-295e-4c67-acad-275ce6849c5c`)
- Seguro: só move leads que têm regra correspondente e estão em etapa diferente da destino

## Resultado
- Leads existentes serão reposicionados conforme as regras configuradas
- Novos eventos continuam sendo processados automaticamente pela RPC v5
- Nenhuma alteração de código frontend necessária

