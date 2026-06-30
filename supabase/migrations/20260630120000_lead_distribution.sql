-- ═══════════════════════════════════════════════════════════════════
-- DISTRIBUIÇÃO AUTOMÁTICA PONDERADA DE LEADS POR VENDEDOR
-- Por funil: admin/gestor liga o toggle e define pesos (ex: 90 Gabi / 10 Silvia).
-- O webhook-lead atribui leads novos SEM dono à vendedora com menor
-- (assigned_count + 1) / weight — converge aos pesos e espalha a distribuição.
-- O "Assumir" manual (claim) continua funcionando por cima.
-- ═══════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────
-- 1. Pesos por funil
-- ─────────────────────────────────────────────────────────────────
create table if not exists public.lead_distribution_weights (
  id              uuid primary key default gen_random_uuid(),
  funnel_id       uuid not null references public.lead_funnels(id) on delete cascade,
  user_id         uuid not null references public.user_profiles(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  weight          int  not null default 1 check (weight >= 0),
  assigned_count  int  not null default 0,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (funnel_id, user_id)
);

create index if not exists idx_lead_distribution_weights_funnel
  on public.lead_distribution_weights(funnel_id);

-- Flag por funil
alter table public.lead_funnels
  add column if not exists auto_distribute_leads boolean not null default false;

-- ─────────────────────────────────────────────────────────────────
-- 2. RLS — leitura por admin/gestor da org; service_role gerencia tudo.
--    (As escritas reais passam pelas RPCs SECURITY DEFINER abaixo.)
-- ─────────────────────────────────────────────────────────────────
alter table public.lead_distribution_weights enable row level security;

drop policy if exists "Admin/gestor read distribution weights" on public.lead_distribution_weights;
create policy "Admin/gestor read distribution weights"
  on public.lead_distribution_weights for select to authenticated
  using (
    organization_id = public.get_user_org_id()
    and (select role from public.user_profiles where id = auth.uid()) in ('admin', 'gestor')
  );

drop policy if exists "Service role manage distribution weights" on public.lead_distribution_weights;
create policy "Service role manage distribution weights"
  on public.lead_distribution_weights for all to service_role
  using (true) with check (true);

-- ─────────────────────────────────────────────────────────────────
-- 3. RPC — ler config do funil (toggle + pesos). Membros da org.
-- ─────────────────────────────────────────────────────────────────
create or replace function public.get_funnel_distribution(p_funnel_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org     uuid;
  v_enabled boolean;
  v_weights jsonb;
begin
  select organization_id, coalesce(auto_distribute_leads, false)
    into v_org, v_enabled
  from public.lead_funnels
  where id = p_funnel_id;

  if v_org is null then
    raise exception 'Funil não encontrado';
  end if;

  if v_org <> public.get_user_org_id() then
    raise exception 'Sem permissão para este funil';
  end if;

  select coalesce(
           jsonb_agg(
             jsonb_build_object(
               'user_id', w.user_id,
               'full_name', coalesce(p.full_name, 'Sem nome'),
               'weight', w.weight,
               'assigned_count', w.assigned_count
             )
             order by p.full_name
           ),
           '[]'::jsonb
         )
    into v_weights
  from public.lead_distribution_weights w
  left join public.user_profiles p on p.id = w.user_id
  where w.funnel_id = p_funnel_id;

  return jsonb_build_object('enabled', v_enabled, 'weights', v_weights);
end;
$$;

-- ─────────────────────────────────────────────────────────────────
-- 4. RPC — salvar config (upsert pesos + flag). Restrito a admin/gestor.
--    Salvar SEMPRE zera os contadores do funil (recomeça o balanceamento
--    proporcional, pra não arrastar histórico de pesos antigos).
-- ─────────────────────────────────────────────────────────────────
create or replace function public.set_funnel_distribution(
  p_funnel_id uuid,
  p_enabled   boolean,
  p_weights   jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org  uuid;
  v_role text;
  v_item jsonb;
begin
  select organization_id into v_org
  from public.lead_funnels
  where id = p_funnel_id;

  if v_org is null then
    raise exception 'Funil não encontrado';
  end if;

  if v_org <> public.get_user_org_id() then
    raise exception 'Sem permissão para este funil';
  end if;

  select role into v_role from public.user_profiles where id = auth.uid();
  if v_role is null or v_role not in ('admin', 'gestor') then
    raise exception 'Apenas admin/gestor pode configurar a distribuição';
  end if;

  update public.lead_funnels
    set auto_distribute_leads = coalesce(p_enabled, false)
  where id = p_funnel_id;

  -- upsert dos pesos enviados
  for v_item in
    select * from jsonb_array_elements(coalesce(p_weights, '[]'::jsonb))
  loop
    insert into public.lead_distribution_weights
      (funnel_id, user_id, organization_id, weight, assigned_count)
    values
      (p_funnel_id, (v_item->>'user_id')::uuid, v_org, greatest(coalesce((v_item->>'weight')::int, 0), 0), 0)
    on conflict (funnel_id, user_id) do update
      set weight = excluded.weight,
          updated_at = now();
  end loop;

  -- remove vendedoras que não vieram na config
  delete from public.lead_distribution_weights
  where funnel_id = p_funnel_id
    and user_id not in (
      select (e->>'user_id')::uuid
      from jsonb_array_elements(coalesce(p_weights, '[]'::jsonb)) e
    );

  -- recomeça o balanceamento do zero
  update public.lead_distribution_weights
    set assigned_count = 0, updated_at = now()
  where funnel_id = p_funnel_id;
end;
$$;

-- ─────────────────────────────────────────────────────────────────
-- 5. RPC — o cérebro: atribui um lead sem dono pela distribuição ponderada.
--    Chamado pelo webhook-lead (service_role). Atômico via advisory lock
--    por funil. Retorna o user_id escolhido, ou NULL (desligado / lead já
--    tem dono / sem candidata).
-- ─────────────────────────────────────────────────────────────────
create or replace function public.assign_lead_by_distribution(
  p_funnel_id uuid,
  p_lead_id   uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org     uuid;
  v_enabled boolean;
  v_chosen  uuid;
begin
  select organization_id, coalesce(auto_distribute_leads, false)
    into v_org, v_enabled
  from public.lead_funnels
  where id = p_funnel_id;

  if v_org is null or not v_enabled then
    return null;
  end if;

  -- serializa atribuições concorrentes do mesmo funil
  perform pg_advisory_xact_lock(hashtext('lead_dist:' || p_funnel_id::text));

  -- lead ainda sem dono?
  if not exists (
    select 1 from public.leads
    where id = p_lead_id and organization_id = v_org and assigned_to is null
  ) then
    return null;
  end if;

  -- candidata: peso > 0 + acesso ao funil (específico ou org-wide) + perfil ativo;
  -- menor (assigned_count + 1) / weight; desempate determinístico.
  select w.user_id into v_chosen
  from public.lead_distribution_weights w
  join public.user_profiles p
    on p.id = w.user_id and p.status = 'active'
  where w.funnel_id = p_funnel_id
    and w.weight > 0
    and exists (
      select 1 from public.lead_funnel_access a
      where a.user_id = w.user_id
        and a.organization_id = v_org
        and (a.funnel_id = p_funnel_id or a.funnel_id is null)
    )
  order by (w.assigned_count + 1)::numeric / w.weight asc,
           w.assigned_count asc,
           w.user_id asc
  limit 1;

  if v_chosen is null then
    return null;
  end if;

  update public.leads
    set assigned_to = v_chosen, updated_at = now()
  where id = p_lead_id and assigned_to is null;

  if not found then
    return null;  -- corrida: alguém assumiu nesse meio tempo
  end if;

  update public.lead_distribution_weights
    set assigned_count = assigned_count + 1, updated_at = now()
  where funnel_id = p_funnel_id and user_id = v_chosen;

  return v_chosen;
end;
$$;

-- ─────────────────────────────────────────────────────────────────
-- 6. Grants
-- ─────────────────────────────────────────────────────────────────
grant execute on function public.get_funnel_distribution(uuid)            to authenticated;
grant execute on function public.set_funnel_distribution(uuid, boolean, jsonb) to authenticated;
grant execute on function public.assign_lead_by_distribution(uuid, uuid)  to service_role;

comment on table public.lead_distribution_weights is
  'Pesos de distribuição automática de leads por funil/vendedor. assigned_count é o contador de balanceamento (zera ao salvar a config).';
comment on column public.lead_funnels.auto_distribute_leads is
  'Liga a distribuição automática ponderada de leads novos (sem dono) no webhook-lead.';
