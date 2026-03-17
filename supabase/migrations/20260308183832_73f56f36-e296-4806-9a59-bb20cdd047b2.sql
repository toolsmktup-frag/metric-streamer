
-- Ad accounts
create table public.meta_ad_accounts (
  id uuid primary key default gen_random_uuid(),
  account_id text not null unique,
  name text,
  currency text default 'BRL',
  created_at timestamptz default now()
);

-- Campaigns
create table public.meta_campaigns (
  id text primary key,
  account_id text not null,
  name text not null,
  status text not null default 'ACTIVE',
  objective text,
  daily_budget numeric,
  lifetime_budget numeric,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Adsets
create table public.meta_adsets (
  id text primary key,
  campaign_id text not null,
  name text not null,
  status text not null default 'ACTIVE',
  targeting jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Ads
create table public.meta_ads (
  id text primary key,
  adset_id text not null,
  campaign_id text not null,
  name text not null,
  status text not null default 'ACTIVE',
  creative jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Main insights per object per date
create table public.meta_insights (
  id uuid primary key default gen_random_uuid(),
  object_id text not null,
  object_type text not null check (object_type in ('account','campaign','adset','ad')),
  date_start date not null,
  date_stop date not null,
  spend numeric default 0,
  impressions bigint default 0,
  reach bigint default 0,
  clicks bigint default 0,
  link_clicks bigint default 0,
  cpc numeric default 0,
  cpm numeric default 0,
  ctr numeric default 0,
  actions jsonb default '[]',
  cost_per_action_type jsonb default '[]',
  created_at timestamptz default now(),
  unique(object_id, object_type, date_start, date_stop)
);

-- Demographic breakdown
create table public.meta_demographic_insights (
  id uuid primary key default gen_random_uuid(),
  date_start date not null,
  age text,
  gender text,
  spend numeric default 0,
  impressions bigint default 0,
  clicks bigint default 0,
  reach bigint default 0,
  actions jsonb default '[]',
  unique(date_start, age, gender)
);

-- Geographic breakdown
create table public.meta_geo_insights (
  id uuid primary key default gen_random_uuid(),
  date_start date not null,
  country text,
  spend numeric default 0,
  impressions bigint default 0,
  clicks bigint default 0,
  reach bigint default 0,
  actions jsonb default '[]',
  unique(date_start, country)
);

-- Device/Platform breakdown
create table public.meta_device_insights (
  id uuid primary key default gen_random_uuid(),
  date_start date not null,
  publisher_platform text,
  platform_position text,
  impression_device text,
  spend numeric default 0,
  impressions bigint default 0,
  clicks bigint default 0,
  reach bigint default 0,
  actions jsonb default '[]',
  unique(date_start, publisher_platform, platform_position, impression_device)
);

-- Sync log
create table public.meta_sync_log (
  id uuid primary key default gen_random_uuid(),
  started_at timestamptz default now(),
  finished_at timestamptz,
  status text default 'running',
  records_synced int default 0,
  error text
);

-- Indexes for common queries
create index idx_meta_insights_date on public.meta_insights(date_start, date_stop);
create index idx_meta_insights_object on public.meta_insights(object_id, object_type);
create index idx_meta_demographic_date on public.meta_demographic_insights(date_start);
create index idx_meta_geo_date on public.meta_geo_insights(date_start);
create index idx_meta_device_date on public.meta_device_insights(date_start);
