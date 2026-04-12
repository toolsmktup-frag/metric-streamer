

## Documento SQL Consolidado — Todas as Migrations Pendentes

Vou gerar um único arquivo `.sql` com **todas** as migrations que você precisa rodar no Supabase SQL Editor, na ordem correta de dependências.

### O que vai incluir (na ordem)

1. **Helper function** `get_user_org_id()`
2. **Tabelas base** — `lead_campaigns`, `lead_funnels`, `lead_funnel_stages`, `stage_transition_rules`, `leads`, `lead_events`, `lead_stage_positions`, `funnel_source_nodes`, `funnel_edges`
3. **ALTER tables** — `traffic_funnel_id` (campaigns + funnels), `meta_pixel_id`/`meta_access_token`, `hide_values`, `page_type`
4. **Tabelas de produto** — `lead_funnel_products`, `lead_funnel_products_auto_move`, `lead_product_mappings`
5. **Enum + coluna** — `value_classification` no `stage_transition_rules`
6. **RPC** — `sync_lead_from_sale` v5 (com metadata merge + stage transition rules)
7. **Backfill** — script para reprocessar eventos históricos
8. **Índices** de performance

### Arquivo gerado
- `/mnt/documents/all-sql-migrations.sql` — copiar e colar no Supabase SQL Editor, de uma vez

### Resultado
Um único documento, ordenado por dependências, idempotente (`IF NOT EXISTS`, `IF NOT EXISTS`). Você cola no SQL Editor e roda tudo.

