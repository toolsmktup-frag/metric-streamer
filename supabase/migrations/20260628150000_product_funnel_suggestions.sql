-- ═══════════════════════════════════════════════════════════════════
-- Motor de classificação automática — tabela de sugestões + rastreio
--
-- O dashboard lê a posição no funil de `funnel_products` (via a view
-- v_all_sales_classified). Quando um produto NOVO vende e não está em
-- funnel_products, ele cai em 'other' e some das métricas por tipo.
--
-- A edge function `classify-sales` (cron diário) detecta esses produtos,
-- a IA sugere {funil, role}, e:
--   - alta confiança  → auto-aplica em funnel_products (source='ai_auto')
--   - média/baixa     → fica aqui como 'pending' p/ revisão humana
-- Tudo fica registrado aqui (auditável e reversível).
-- ═══════════════════════════════════════════════════════════════════

-- Rastreio de origem em funnel_products (distinguir manual x IA; reversível)
alter table public.funnel_products
  add column if not exists source text not null default 'manual',
  add column if not exists ai_confidence text;

comment on column public.funnel_products.source is
  'manual | ai_auto (inserido pelo motor classify-sales)';

-- Log/fila de sugestões do motor
create table if not exists public.product_funnel_suggestions (
  id uuid primary key default gen_random_uuid(),
  platform text,
  product_id text,
  product_name text,
  sales_count integer default 0,
  revenue numeric default 0,
  suggested_funnel_id uuid references public.funnels(id) on delete set null,
  suggested_funnel_name text,
  suggested_role text,                         -- front | order_bump | upsell1.. | downsell | other
  confidence text,                             -- high | medium | low
  reasoning text,
  status text not null default 'pending',      -- pending | applied | rejected
  created_at timestamptz not null default now(),
  decided_at timestamptz,
  unique (platform, product_id)
);

alter table public.product_funnel_suggestions enable row level security;

create policy "Org members read suggestions"
  on public.product_funnel_suggestions for select to authenticated using (true);
create policy "Org members update suggestions"
  on public.product_funnel_suggestions for update to authenticated using (true);
create policy "Service role manages suggestions"
  on public.product_funnel_suggestions for all to service_role using (true) with check (true);

create index if not exists idx_pfs_status on public.product_funnel_suggestions(status);
