
-- Drop all RESTRICTIVE policies and recreate as PERMISSIVE
DROP POLICY IF EXISTS "Authenticated read" ON public.meta_campaigns;
DROP POLICY IF EXISTS "Authenticated read" ON public.meta_adsets;
DROP POLICY IF EXISTS "Authenticated read" ON public.meta_ads;
DROP POLICY IF EXISTS "Authenticated read" ON public.meta_insights;
DROP POLICY IF EXISTS "Authenticated read" ON public.meta_sync_log;
DROP POLICY IF EXISTS "Authenticated read" ON public.meta_ad_accounts;
DROP POLICY IF EXISTS "Authenticated read" ON public.meta_demographic_insights;
DROP POLICY IF EXISTS "Authenticated read" ON public.meta_geo_insights;
DROP POLICY IF EXISTS "Authenticated read" ON public.meta_device_insights;

-- Recreate as PERMISSIVE (default) for authenticated users
CREATE POLICY "Authenticated read" ON public.meta_campaigns FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated read" ON public.meta_adsets FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated read" ON public.meta_ads FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated read" ON public.meta_insights FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated read" ON public.meta_sync_log FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated read" ON public.meta_ad_accounts FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated read" ON public.meta_demographic_insights FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated read" ON public.meta_geo_insights FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated read" ON public.meta_device_insights FOR SELECT TO authenticated USING (true);

-- Also fix the stuck sync log entry
UPDATE meta_sync_log SET status = 'failed', error = 'stuck', finished_at = now() WHERE status = 'running' AND finished_at IS NULL;
