
-- Just drop the remaining public read policies (authenticated ones already exist)
DROP POLICY IF EXISTS "Allow public read" ON public.meta_ad_accounts;
DROP POLICY IF EXISTS "Allow public read" ON public.meta_ads;
DROP POLICY IF EXISTS "Allow public read" ON public.meta_adsets;
DROP POLICY IF EXISTS "Allow public read" ON public.meta_campaigns;
DROP POLICY IF EXISTS "Allow public read" ON public.meta_demographic_insights;
DROP POLICY IF EXISTS "Allow public read" ON public.meta_device_insights;
DROP POLICY IF EXISTS "Allow public read" ON public.meta_geo_insights;
DROP POLICY IF EXISTS "Allow public read" ON public.meta_insights;
DROP POLICY IF EXISTS "Allow public read" ON public.meta_sync_log;
DROP POLICY IF EXISTS "Allow public read " ON public.meta_ad_accounts;
DROP POLICY IF EXISTS "Allow public read " ON public.meta_ads;
DROP POLICY IF EXISTS "Allow public read " ON public.meta_adsets;
DROP POLICY IF EXISTS "Allow public read " ON public.meta_campaigns;
DROP POLICY IF EXISTS "Allow public read " ON public.meta_demographic_insights;
DROP POLICY IF EXISTS "Allow public read " ON public.meta_device_insights;
DROP POLICY IF EXISTS "Allow public read " ON public.meta_geo_insights;
DROP POLICY IF EXISTS "Allow public read " ON public.meta_insights;
DROP POLICY IF EXISTS "Allow public read " ON public.meta_sync_log;
