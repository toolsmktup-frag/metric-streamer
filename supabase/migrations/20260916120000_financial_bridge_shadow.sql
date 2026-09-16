-- MF-001: independent financial intake. No triggers on CRM or transactions.
create table public.financial_source_accounts (
  platform text not null check(platform in ('guru','ticto','youshop','eduzz')),
  account_id text not null,
  credential_ref text not null,
  export_enabled boolean not null default false,
  created_at timestamptz not null default now(),
  primary key(platform, credential_ref)
);
create table public.financial_webhook_inbox (
  id bigint generated always as identity primary key,
  platform text not null,
  credential_ref text not null,
  account_id text,
  raw_hash text not null,
  raw_payload jsonb not null,
  received_at timestamptz not null default now(),
  normalization_status text not null check(normalization_status in ('ready','account_unmapped','identity_or_currency_unverified')),
  unique(platform,credential_ref,raw_hash)
);
create table public.financial_outbox (
  id bigint generated always as identity primary key,
  inbox_id bigint not null references public.financial_webhook_inbox(id),
  platform text not null,
  account_id text not null,
  event_id text not null unique,
  payload_hash text not null,
  envelope jsonb not null,
  created_at timestamptz not null default now(),
  lease_token uuid,
  lease_expires_at timestamptz,
  attempts integer not null default 0,
  available_at timestamptz not null default now(),
  delivered_at timestamptz
);
create index financial_outbox_pending on public.financial_outbox(id) where delivered_at is null;
alter table public.financial_source_accounts enable row level security;
alter table public.financial_webhook_inbox enable row level security;
alter table public.financial_outbox enable row level security;
revoke all on public.financial_source_accounts,public.financial_webhook_inbox,public.financial_outbox from anon,authenticated;
grant all on public.financial_source_accounts,public.financial_webhook_inbox,public.financial_outbox to service_role;
grant usage, select on sequence public.financial_webhook_inbox_id_seq,public.financial_outbox_id_seq to service_role;

create function public.financial_capture_event(p_platform text,p_credential_ref text,p_account_id text,p_raw_hash text,p_raw_payload jsonb,p_event jsonb)
returns bigint language plpgsql security definer set search_path = public,pg_temp as $$
declare v_id bigint; v_hash text;
begin
  if p_platform not in ('guru','ticto','youshop','eduzz') or length(p_raw_hash) <> 64 or octet_length(p_raw_payload::text)>2097152 then raise exception 'invalid intake'; end if;
  if p_account_id is not null and not exists(select 1 from financial_source_accounts where platform=p_platform and credential_ref=p_credential_ref and account_id=p_account_id) then raise exception 'unmapped account'; end if;
  insert into financial_webhook_inbox(platform,credential_ref,account_id,raw_hash,raw_payload,normalization_status)
  values(p_platform,p_credential_ref,p_account_id,p_raw_hash,p_raw_payload,case when p_account_id is null then 'account_unmapped' when p_event is null then 'identity_or_currency_unverified' else 'ready' end)
  on conflict(platform,credential_ref,raw_hash) do update set account_id=excluded.account_id,normalization_status=excluded.normalization_status returning id into v_id;
  if p_event is not null then
    if p_event->>'platform' is distinct from p_platform or p_event->>'account_id' is distinct from p_account_id or p_account_id is null then raise exception 'invalid event scope'; end if;
    insert into financial_outbox(inbox_id,platform,account_id,event_id,payload_hash,envelope)
    values(v_id,p_platform,p_account_id,p_event->>'event_id',p_event->>'payload_hash',p_event) on conflict(event_id) do nothing;
    select payload_hash into v_hash from financial_outbox where event_id=p_event->>'event_id';
    if v_hash is distinct from p_event->>'payload_hash' then raise exception 'financial event conflict'; end if;
  end if;
  return v_id;
end $$;

create function public.financial_bridge_claim(p_limit integer default 50)
returns jsonb language plpgsql security definer set search_path = public,pg_temp as $$
declare v_token uuid := gen_random_uuid(); v_until timestamptz := now()+interval '120 seconds'; v_events jsonb;
begin
  if p_limit is null or p_limit not between 1 and 100 then raise exception 'invalid limit'; end if;
  with candidates as (
    select o.id from financial_outbox o where o.delivered_at is null and o.attempts < 20 and o.available_at<=now()
      and (o.lease_expires_at is null or o.lease_expires_at<=now())
      and exists(select 1 from financial_source_accounts a where a.platform=o.platform and a.account_id=o.account_id and a.export_enabled)
    order by o.id limit p_limit for update skip locked
  ), claimed as (
    update financial_outbox o set lease_token=v_token,lease_expires_at=v_until,attempts=attempts+1,
      available_at=v_until+make_interval(secs=>least(3600,power(2,attempts)::integer))
    from candidates c where o.id=c.id returning o.id,o.envelope
  ) select coalesce(jsonb_agg(envelope order by id),'[]'::jsonb) into v_events from claimed;
  return jsonb_build_object('schema_version',1,'lease_token',v_token,'lease_expires_at',v_until,'events',v_events);
end $$;

create function public.financial_bridge_ack(p_lease_token uuid,p_event_ids text[])
returns integer language plpgsql security definer set search_path = public,pg_temp as $$
declare v_total integer;
begin
  if p_lease_token is null or p_event_ids is null or cardinality(p_event_ids) not between 1 and 100 or exists(select 1 from unnest(p_event_ids) x where x is null) then raise exception 'invalid ids'; end if;
  -- Lock before checking lease to prevent concurrent claim replacing an expired token.
  perform 1 from financial_outbox where event_id=any(p_event_ids) for update;
  select count(*) into v_total from financial_outbox where event_id=any(p_event_ids) and lease_token=p_lease_token and (delivered_at is not null or lease_expires_at>now());
  if v_total <> (select count(distinct x) from unnest(p_event_ids) x) then raise exception 'invalid or expired lease'; end if;
  update financial_outbox set delivered_at=coalesce(delivered_at,now()) where event_id=any(p_event_ids) and lease_token=p_lease_token;
  return v_total;
end $$;
revoke all on function public.financial_capture_event(text,text,text,text,jsonb,jsonb),public.financial_bridge_claim(integer),public.financial_bridge_ack(uuid,text[]) from public,anon,authenticated;
grant execute on function public.financial_capture_event(text,text,text,text,jsonb,jsonb),public.financial_bridge_claim(integer),public.financial_bridge_ack(uuid,text[]) to service_role;
