ALTER TABLE product_offer_mappings
ADD COLUMN IF NOT EXISTS external_product_id text;
