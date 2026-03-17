
-- Add foreign key relationships for drill-down queries
ALTER TABLE public.meta_adsets
  ADD CONSTRAINT meta_adsets_campaign_id_fkey
  FOREIGN KEY (campaign_id) REFERENCES public.meta_campaigns(id) ON DELETE CASCADE;

ALTER TABLE public.meta_ads
  ADD CONSTRAINT meta_ads_campaign_id_fkey
  FOREIGN KEY (campaign_id) REFERENCES public.meta_campaigns(id) ON DELETE CASCADE;

ALTER TABLE public.meta_ads
  ADD CONSTRAINT meta_ads_adset_id_fkey
  FOREIGN KEY (adset_id) REFERENCES public.meta_adsets(id) ON DELETE CASCADE;
