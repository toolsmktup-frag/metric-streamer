-- ============================================================
-- Sales Copilot — Ofertas
-- Cole no Supabase SQL Editor e rode.
-- ============================================================

create table if not exists public.sales_copilot_offers (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  status text not null default 'active'
    check (status in ('draft','active','paused','archived')),
  is_featured boolean not null default false,
  short_description text,
  price_promo text,
  price_full text,
  access_period text,
  composition text,
  target_audience text,
  ai_rules text,
  sort_order int not null default 0,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_offers_org_status
  on public.sales_copilot_offers (organization_id, status, sort_order);

-- Apenas 1 oferta destacada por organização
create unique index if not exists idx_offers_one_featured_per_org
  on public.sales_copilot_offers (organization_id) where is_featured = true;

-- updated_at automático
create or replace function public.set_sales_copilot_offers_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end; $$;

drop trigger if exists trg_sales_copilot_offers_updated on public.sales_copilot_offers;
create trigger trg_sales_copilot_offers_updated
  before update on public.sales_copilot_offers
  for each row execute function public.set_sales_copilot_offers_updated_at();

-- RLS
alter table public.sales_copilot_offers enable row level security;

-- Ver: qualquer membro autenticado da org
drop policy if exists "offers_select_by_org" on public.sales_copilot_offers;
create policy "offers_select_by_org" on public.sales_copilot_offers
  for select to authenticated
  using (
    organization_id in (
      select organization_id from public.user_profiles where id = auth.uid()
    )
  );

-- Mutar: apenas admin/gestor da org
drop policy if exists "offers_insert_admin" on public.sales_copilot_offers;
create policy "offers_insert_admin" on public.sales_copilot_offers
  for insert to authenticated
  with check (
    organization_id in (
      select up.organization_id from public.user_profiles up
      where up.id = auth.uid() and up.role in ('admin','gestor')
    )
  );

drop policy if exists "offers_update_admin" on public.sales_copilot_offers;
create policy "offers_update_admin" on public.sales_copilot_offers
  for update to authenticated
  using (
    organization_id in (
      select up.organization_id from public.user_profiles up
      where up.id = auth.uid() and up.role in ('admin','gestor')
    )
  )
  with check (
    organization_id in (
      select up.organization_id from public.user_profiles up
      where up.id = auth.uid() and up.role in ('admin','gestor')
    )
  );

drop policy if exists "offers_delete_admin" on public.sales_copilot_offers;
create policy "offers_delete_admin" on public.sales_copilot_offers
  for delete to authenticated
  using (
    organization_id in (
      select up.organization_id from public.user_profiles up
      where up.id = auth.uid() and up.role in ('admin','gestor')
    )
  );
