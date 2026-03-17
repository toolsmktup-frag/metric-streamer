-- Fix meta_ad_id values that contain ::tracking_data:: suffix
UPDATE ticto_transactions
SET meta_ad_id = split_part(meta_ad_id, '::', 1)
WHERE meta_ad_id LIKE '%::%';

-- Also fix meta_adset_id and meta_campaign_id just in case
UPDATE ticto_transactions
SET meta_adset_id = split_part(meta_adset_id, '::', 1)
WHERE meta_adset_id LIKE '%::%';

UPDATE ticto_transactions
SET meta_campaign_id = split_part(meta_campaign_id, '::', 1)
WHERE meta_campaign_id LIKE '%::%';