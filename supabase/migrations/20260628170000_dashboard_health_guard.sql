-- ═══════════════════════════════════════════════════════════════════
-- Rede de segurança: detector de regressão do dashboard
--
-- Pega o sintoma deste incidente (vendas caindo em 'other' / receita
-- subcontada). Roda diário, grava um log de saúde e marca anomalia
-- quando a % de receita em 'other' sobe demais ou há muitos produtos
-- sem classificação — sinal de produto novo não mapeado OU de a lógica
-- de classificação ter sido quebrada de novo.
-- ═══════════════════════════════════════════════════════════════════

create table if not exists public.dashboard_health_log (
  id uuid primary key default gen_random_uuid(),
  checked_at timestamptz not null default now(),
  revenue_total numeric,
  revenue_other numeric,
  pct_other numeric,
  unmapped_products integer,
  is_anomaly boolean not null default false,
  note text
);

alter table public.dashboard_health_log enable row level security;
create policy "read health log" on public.dashboard_health_log
  for select to authenticated using (true);
create policy "service manages health log" on public.dashboard_health_log
  for all to service_role using (true) with check (true);

create or replace function public.check_dashboard_health()
returns public.dashboard_health_log
language plpgsql
security definer
set search_path = public
as $$
declare
  v_total numeric; v_other numeric; v_pct numeric; v_gaps integer;
  v_anom boolean; v_note text; v_row public.dashboard_health_log;
begin
  select coalesce(sum(revenue), 0),
         coalesce(sum(revenue) filter (where funnel_position = 'other'), 0)
    into v_total, v_other
  from public.v_all_sales_classified
  where status = 'authorized' and purchased_at >= now() - interval '2 days';

  v_pct  := case when v_total > 0 then round(100.0 * v_other / v_total, 1) else 0 end;
  select count(*) into v_gaps from public.v_unmapped_products;

  -- Anomalia: muita receita não classificada OU muitos produtos sem mapa
  v_anom := (v_pct > 15) or (v_gaps > 5);
  v_note := case when v_anom
    then format('⚠️ %s%% da receita (2d) está em "other" e %s produto(s) sem classificação. Rodar classify-sales / revisar funnel_products.', v_pct, v_gaps)
    else format('OK — %s%% em other, %s produto(s) não mapeado(s).', v_pct, v_gaps)
  end;

  insert into public.dashboard_health_log
    (revenue_total, revenue_other, pct_other, unmapped_products, is_anomaly, note)
  values (v_total, v_other, v_pct, v_gaps, v_anom, v_note)
  returning * into v_row;

  return v_row;
end $$;

-- Cron diário 07:30 UTC (04:30 BRT) — após o classify-sales (06h BRT)
select cron.unschedule('dashboard-health-daily')
  where exists (select 1 from cron.job where jobname = 'dashboard-health-daily');
select cron.schedule('dashboard-health-daily', '30 7 * * *', $$ select public.check_dashboard_health(); $$);
