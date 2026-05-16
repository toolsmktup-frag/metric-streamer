# Marcar origem da conta Guru (Soulnaturi vs Articulabem)

Mantém **1 funil só**, mas cada venda e cada lead passam a carregar a conta Guru de origem, para que dashboards, Kanban e relatórios consigam filtrar/segmentar por marca.

## Mapeamento das contas

| api_token (Guru) | Conta / Marca |
|---|---|
| `9fmDLyGxbcXGqcZyTJb8Kcb1BjhY8xwfrEprE7t6` | **Soulnaturi** |
| `O3yB6USrrplTojFXy7jltjhviNujOHUE35ITGYjz` | **Articulabem** |

Mapa fica configurável (não hardcoded no código) — guardado em uma tabela ou JSON de config para você poder adicionar/renomear contas futuramente sem precisar redeployar edge function.

## O que muda

### 1. Banco — nova coluna + tabela de mapa
- Nova tabela `guru_accounts` (`api_token` PK, `account_slug`, `display_name`, `color`) — cadastro das duas contas.
- Nova coluna `customer_purchases.guru_account_slug` (text, nullable, indexada).
- Atualizar a view `v_all_sales` para expor `guru_account_slug` e `guru_account_name` (JOIN com `guru_accounts`).

### 2. Webhook Guru (`supabase/functions/guru-webhook/index.ts`)
- Extrair `payload.api_token`, resolver contra `guru_accounts`, gravar `guru_account_slug` no `customer_purchases`.
- Passar `guru_account: <slug>` dentro do `p_metadata` do `sync_lead_from_sale` → fica salvo no `lead.metadata` e no `lead_events.metadata`.
- Aplicar tag automática no lead: `origem:soulnaturi` ou `origem:articulabem` (via `lead_tags`), pra usar em filtros e router de automações WhatsApp.

### 3. Backfill (1x)
Script SQL que percorre `customer_purchases` onde `platform='guru'` e popula `guru_account_slug` a partir de `raw_data->>'api_token'`. Também tagueia os leads associados.

### 4. UI — visibilidade da origem
- **Vendas** (`/vendas`): novo filtro "Conta Guru" no topo (Todas / Soulnaturi / Articulabem) + coluna/badge colorido na linha da venda.
- **Lead Detail** (drawer/sidebar): badge da conta Guru visível ao lado do nome do produto na timeline de compras.
- **Kanban**: badge pequeno (cor por conta) no card do lead quando ele tem origem Guru identificada.
- **Dashboard CRM**: card de KPI "Vendas por conta" (Soulnaturi vs Articulabem) — split simples por contagem e receita.

### 5. Automações WhatsApp (preparação, sem alterar fluxos existentes)
A tag `origem:soulnaturi` / `origem:articulabem` aplicada no lead já permite que você use o **Router por Tag** nas automações existentes — não precisa mexer em flow nenhum agora, só ganha a capacidade de bifurcar quando quiser.

## Ordem de execução

1. Migration: cria `guru_accounts`, coluna `guru_account_slug`, atualiza `v_all_sales`.
2. Seed: insere as 2 contas (Soulnaturi e Articulabem) na `guru_accounts`.
3. Patch no `guru-webhook` (deploy manual no Supabase Dashboard — você cola).
4. Backfill SQL (você roda no Dashboard).
5. UI: filtro e badges em Vendas, Lead Detail, Kanban, KPI.

## Detalhes técnicos

- `guru_account_slug` em vez de `account_id` direto pra ficar legível em filtros/URLs (`?conta=soulnaturi`).
- View `v_all_sales` resolve o `display_name` no JOIN para o front consumir já formatado.
- Tag aplicada via insert idempotente em `lead_tags` (não duplica se já existir).
- Cores das contas guardadas em `guru_accounts.color` (HSL) → frontend usa direto, sem hardcode.
- Nada quebra retroativo: coluna nullable, view tolera NULL, UI mostra "—" quando origem desconhecida.
