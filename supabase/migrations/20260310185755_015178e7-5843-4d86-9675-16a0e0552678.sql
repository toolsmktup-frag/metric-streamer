-- Delete all data BEFORE March 10, 2026. Preserve day 10+.

-- Ticto transactions (vendas)
DELETE FROM public.ticto_transactions WHERE order_date < '2026-03-10T00:00:00+00:00' OR order_date IS NULL;

-- Meta insights (spend, clicks, impressions per campaign/adset/ad)
DELETE FROM public.meta_insights WHERE date_start < '2026-03-10';

-- Meta demographic insights
DELETE FROM public.meta_demographic_insights WHERE date_start < '2026-03-10';

-- Meta device insights
DELETE FROM public.meta_device_insights WHERE date_start < '2026-03-10';

-- Meta geo insights
DELETE FROM public.meta_geo_insights WHERE date_start < '2026-03-10';

-- Meta sync log (historical sync records)
DELETE FROM public.meta_sync_log WHERE started_at < '2026-03-10T00:00:00+00:00';

-- Daily analyses
DELETE FROM public.daily_analyses WHERE analysis_date < '2026-03-10';