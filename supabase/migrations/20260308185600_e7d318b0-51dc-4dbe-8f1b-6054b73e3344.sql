
-- Drop all existing public read policies and replace with authenticated-only

DROP POLICY IF EXISTS "Allow public read " ON public.meta_ad_accounts;
DROP POLICY IF EXISTS "Allow public read " ON public.meta_ads;
DROP POLICY IF EXISTS "Allow public read " ON public.meta_adsets;
DROP POLICY IF EXISTS "Allow public read " ON public.meta_campaigns;
DROP POLICY IF EXISTS "Allow public read " ON public.meta_demographic_insights;
DROP POLICY IF EXISTS "Allow public read " ON public.meta_device_insights;
DROP POLICY IF EXISTS "Allow public read " ON public.meta_geo_insights;
DROP POLICY IF EXISTS "Allow public read " ON public.meta_insights;
DROP POLICY IF EXISTS "Allow public read " ON public.meta_sync_log;

CREATE POLICY "Authenticated read" ON public.meta_ad_accounts FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated read" ON public.meta_ads FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated read" ON public.meta_adsets FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated read" ON public.meta_campaigns FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated read" ON public.meta_demographic_insights FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated read" ON public.meta_device_insights FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated read" ON public.meta_geo_insights FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated read" ON public.meta_insights FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated read" ON public.meta_sync_log FOR SELECT TO authenticated USING (true);
