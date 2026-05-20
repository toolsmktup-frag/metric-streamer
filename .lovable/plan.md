# Cadastro de Produtos desacoplado dos Funis de Tráfego

## Objetivo

Hoje todo produto precisa nascer dentro de um funil de tráfego (`funnels` → `funnel_products`) pra poder ser usado no funil de leads, automações WhatsApp, relatórios, etc. Vamos criar um **catálogo de produtos independente** e adaptar o resto da plataforma pra consumir desse catálogo. Assim você só cria funil de tráfego pros produtos que realmente rodam ads, e os demais (upsell, e-mail, bump) ficam só no cadastro.

## Como vai funcionar (visão do usuário)

- Nova página **"Produtos"** no menu, com lista + cadastro/edição (id da plataforma, nome de exibição, plataforma, role sugerida, dias de recontato, etc.).
- No **Funil de Tráfego**, em vez de cadastrar produto do zero, você **seleciona produtos existentes** do catálogo e define o papel deles naquele funil (front, bump, upsell...). Um produto pode estar em zero, um ou vários funis de tráfego.
- No **Funil de Leads**, o seletor de produtos passa a mostrar **todos os produtos do catálogo**, não só os que estão em algum funil de tráfego.
- Nas **automações WhatsApp**, mesmo seletor unificado.
- Relatórios de tráfego continuam funcionando: produto sem funil de tráfego = sem ROI de ads (correto), mas aparece em CRM/LTV/recontato normalmente.

## Migração dos dados existentes

1. Criar `public.products` populando a partir de `funnel_products` distintos (por `product_id` + `platform`).
2. Manter `funnel_products` como **tabela de vínculo** (funnel ↔ product + role), apontando pra `products.id`.
3. `lead_funnel_products.source_funnel_product_id` passa a apontar pra `products.id` (renomear pra `product_id`).
4. Backfill automático preservando todas as referências atuais — nada quebra.

## Detalhes técnicos

### Schema novo

```text
products
  id (uuid, pk)
  product_id (text)        -- id da plataforma (Ticto/Guru/Kiwify...)
  platform (enum)          -- ticto|guru|kiwify|hotmart|eduzz|outro|null
  display_name (text)
  product_name_contains (text)  -- fallback fuzzy
  default_role (enum, nullable)
  recontact_days (int, nullable)
  is_active (bool)
  created_at, updated_at
  UNIQUE (product_id, platform)
```

`funnel_products` vira:
```text
funnel_products
  id, funnel_id, product_id (FK → products.id), role, sort_order
  UNIQUE (funnel_id, product_id, role)
```

`lead_funnel_products`:
```text
lead_funnel_products
  ... product_id (FK → products.id)   -- renomeia source_funnel_product_id
```

### Código a tocar

- **Migration SQL** (`docs/sql/products-catalog.sql`): criar tabela, backfill, ajustar FKs, RLS.
- **Hooks novos**: `useProducts`, `useUpsertProduct`, `useDeleteProduct`.
- **Hooks ajustados**: `useFunnels`, `useUpsertFunnelProducts`, `useAllFunnelProducts`, `useLeadFunnelProducts`, `useDistinctProductNames`.
- **UI nova**: página `src/pages/Produtos.tsx` + rota + item no menu.
- **UI ajustada**: editor de funil de tráfego (seleciona produto do catálogo em vez de criar inline), `WzProductSelector`, mapeamento de produtos do funil de leads.
- **Edge functions**: webhooks (`webhook-lead`, `sync-leads-from-sales`, etc.) já resolvem produto por `product_id`+`platform` — só precisam ler de `products` em vez de `funnel_products` em alguns lugares de fallback.

### Compatibilidade

- Webhooks continuam funcionando durante a migração (FKs preservadas via backfill).
- Relatórios de Meta Ads / classificação dinâmica seguem usando `funnel_products` (vínculo funnel↔produto) — sem mudança de comportamento.
- LTV / recontato / CRM passam a enxergar produtos do catálogo mesmo sem funil de tráfego.

## Entregáveis

1. Migration SQL pronta pra colar no Supabase Dashboard.
2. Página de Produtos (lista, criar, editar, desativar).
3. Editor de funil de tráfego refatorado pra consumir o catálogo.
4. Seletores (`WzProductSelector`, mapeamento de leads) lendo do catálogo.
5. Smoke test: criar produto avulso → aparece no funil de leads e nas automações sem precisar estar em funil de tráfego.

## Riscos / pontos de atenção

- Refactor grande, mexe em ~15 arquivos + migration com backfill.
- Após aplicar, é bom rodar uma venda de teste em cada plataforma ativa pra confirmar que o webhook ainda casa o produto.
- Deploy manual de edge functions afetadas (regra do projeto).

## Fora de escopo

- Importar produtos diretamente da API da plataforma (Ticto/Guru). Cadastro continua manual.
- Variantes/SKUs físicos — segue como está no módulo de estoque.
