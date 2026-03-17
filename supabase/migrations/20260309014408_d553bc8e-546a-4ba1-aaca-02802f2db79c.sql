-- Drop all existing RESTRICTIVE policies and replace with correct PERMISSIVE ones
-- for all 9 meta tables (authenticated users can SELECT all rows — single-user app)

DO $$
DECLARE
  tbl text;
  tables text[] := ARRAY[
    'meta_campaigns', 'meta_insights', 'meta_ad_accounts',
    'meta_ads', 'meta_adsets', 'meta_demographic_insights',
    'meta_device_insights', 'meta_geo_insights', 'meta_sync_log'
  ];
BEGIN
  FOREACH tbl IN ARRAY tables LOOP
    -- Drop the existing restrictive policy
    EXECUTE format('DROP POLICY IF EXISTS "Authenticated read" ON public.%I', tbl);
    -- Create a correct PERMISSIVE policy
    EXECUTE format(
      'CREATE POLICY "Authenticated read" ON public.%I AS PERMISSIVE FOR SELECT TO authenticated USING (true)',
      tbl
    );
  END LOOP;
END $$;