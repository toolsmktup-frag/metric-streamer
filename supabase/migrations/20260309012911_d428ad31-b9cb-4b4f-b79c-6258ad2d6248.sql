-- Delete ads linked to old account campaigns
DELETE FROM meta_ads WHERE campaign_id IN (SELECT id FROM meta_campaigns WHERE account_id = '100568020635890');

-- Delete adsets linked to old account campaigns  
DELETE FROM meta_adsets WHERE campaign_id IN (SELECT id FROM meta_campaigns WHERE account_id = '100568020635890');

-- Delete insights linked to old account campaigns
DELETE FROM meta_insights WHERE object_id IN (SELECT id FROM meta_campaigns WHERE account_id = '100568020635890');

-- Delete old account campaigns
DELETE FROM meta_campaigns WHERE account_id = '100568020635890';

-- Delete old account record
DELETE FROM meta_ad_accounts WHERE account_id = '100568020635890';