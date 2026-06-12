# RPCs `agent_*` — tooling de automações e produtos (2026-06-12)

RPCs SECURITY DEFINER para agentes (Claude Code via Management API, agente de suporte via
MCP `agent-mcp`) operarem automações sem o editor visual. Migration:
`supabase/migrations/20260613100000_agent_wz_tooling_rpcs.sql` (aplicada em prod 12/06).

**Invariantes:** clones nascem SEMPRE `is_active=false` (ativação só na UI); node ids são
regenerados (contadores de ab_split são por node_id global); toda escrita loga em
`agent_action_logs`.

## Funções

### `agent_get_funnel_overview(p_funnel_id uuid) → jsonb`
Funil + etapas + regras de transição + produtos (com raw names) + automações (com resumo
dos triggers e execuções 30d) + contagem de leads.

### `agent_list_unmapped_products(p_funnel_id, p_days=365, p_min_sales=20) → jsonb`
Produtos com vendas autorizadas no período sem mapeamento no funil (nem raw name nem
contains). Inclui `platform_product_ids` prontos para o clone.

### `agent_upsert_funnel_product(p_funnel_id, p_contains, p_display_name, p_recontact_days=null, p_raw_names='{}') → jsonb`
Upsert em `lead_funnel_products` (unique por `(funil, lower(contains))`) + N
`lead_product_mappings`. Retorna `collisions` (outros contains do funil que casam os raw
names — atenção a fragmentos gulosos) e `platform_product_ids`.

### `agent_clone_wz_flow(p_source_flow_id, p_new_name, p_replacements='{}', p_dry_run=false) → jsonb`
```json
{
  "product_ids":   ["1770503427", "105337"],
  "product_labels": {"1770503427": "Produto X (Ticto)"},
  "text_replacements": [{"from": "Articulabem", "to": "Produto X"}],
  "instance_id": null, "instance_name": null
}
```
- `productIdFilter` casa por **product_id da plataforma** (guru ≠ ticto) — usar os ids de
  `platform_product_ids` do upsert.
- Substituições de texto são cirúrgicas: `messages[].text`, `messages[].blocks[].text/caption`,
  `data.label`, `note.text` — case-insensitive.
- Idempotente por nome (`status:'exists'`). `p_dry_run=true` retorna preview sem criar.

### `agent_link_flow_to_funnel(p_funnel_id, p_flow_id, p_trigger_events='{}', p_show_in_automations=false) → jsonb`
Vínculo `lead_funnel_automations`, idempotente.

### `agent_onboard_product(p_funnel_id, p_display_name, p_contains, p_raw_names, p_recontact_days=null, p_source_flow_id=null, p_flow_name=null, p_product_ids=null, p_text_replacements='[]') → jsonb`
Orquestrador: upsert produto → resolve product_ids das vendas (`v_all_sales`) → clona flow
(inativo) → vincula. `p_source_flow_id=null` faz só o mapeamento.

## Exemplo (onboarding de 1 produto com flow)

```sql
SELECT agent_onboard_product(
  p_funnel_id      => 'b4452a0a-1e4f-4e91-a53e-e873256e90c5',  -- Infoprodutos
  p_display_name   => 'Manual das Ervas para Dores',
  p_contains       => 'MANUAL DAS ERVAS',
  p_raw_names      => ARRAY['Manual das Ervas para Dores','MANUAL DAS ERVAS PARA TRATAR DORES'],
  p_recontact_days => 90,
  p_source_flow_id => (SELECT id FROM wz_flows WHERE name = 'Articulabem - Completo'),
  p_text_replacements => '[{"from":"Articulabem","to":"Manual das Ervas para Dores"}]'::jsonb
);
```

## Avisos

- Placeholders de entrega (`{{link_acesso}}`, `{{login_acesso}}`, `{{senha_acesso}}`) saem
  **literais** até o `substituteVariables` do wz-executor conhecê-los (integração Cademi,
  fase 2). Por isso (e por revisão de copy) os flows clonados ficam inativos.
- O `wz-receiver` v2.2.0 (deploy 12/06) corrigiu o scope filter que matava flows vinculados
  a lead funnels e passou a respeitar `trigger.disabled` — ver commit no repo.
- Auditoria: `SELECT * FROM agent_action_logs ORDER BY created_at DESC`.
