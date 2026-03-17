
-- Enable RLS on all meta tables
alter table public.meta_ad_accounts enable row level security;
alter table public.meta_campaigns enable row level security;
alter table public.meta_adsets enable row level security;
alter table public.meta_ads enable row level security;
alter table public.meta_insights enable row level security;
alter table public.meta_demographic_insights enable row level security;
alter table public.meta_geo_insights enable row level security;
alter table public.meta_device_insights enable row level security;
alter table public.meta_sync_log enable row level security;

-- Allow public read access (no auth required for dashboard)
create policy "Allow public read" on public.meta_ad_accounts for select using (true);
create policy "Allow public read" on public.meta_campaigns for select using (true);
create policy "Allow public read" on public.meta_adsets for select using (true);
create policy "Allow public read" on public.meta_ads for select using (true);
create policy "Allow public read" on public.meta_insights for select using (true);
create policy "Allow public read" on public.meta_demographic_insights for select using (true);
create policy "Allow public read" on public.meta_geo_insights for select using (true);
create policy "Allow public read" on public.meta_device_insights for select using (true);
create policy "Allow public read" on public.meta_sync_log for select using (true);
