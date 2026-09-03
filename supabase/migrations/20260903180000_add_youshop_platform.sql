-- ============================================================================
-- Plataforma YouShop: libera o valor 'youshop' nos CHECKs de platform.
--
-- Não existe enum; cada tabela tem um CHECK (platform IN (...)) próprio.
-- Os nomes das constraints variam (algumas foram criadas via docs/sql/*.sql
-- manualmente), então localizamos dinamicamente qualquer CHECK da coluna
-- platform que cite 'ticto' e recriamos com a lista completa + 'youshop'.
--
-- Nada muda em v_all_sales / v_all_sales_classified: o braço de
-- customer_purchases aceita qualquer platform <> 'ticto'.
-- ============================================================================

DO $$
DECLARE
  r RECORD;
  v_list text := '''ticto'',''guru'',''kiwify'',''hotmart'',''eduzz'',''youshop'',''manual'',''outro''';
BEGIN
  FOR r IN
    SELECT c.conrelid::regclass AS tbl,
           c.conname,
           c.conrelid,
           pg_get_constraintdef(c.oid) AS def
      FROM pg_constraint c
      JOIN pg_namespace n ON n.oid = c.connamespace
     WHERE n.nspname = 'public'
       AND c.contype = 'c'
       AND c.conrelid::regclass::text IN
           ('customer_purchases','funnels','funnel_platforms','funnel_products','products_catalog')
       AND pg_get_constraintdef(c.oid) ILIKE '%platform%'
       AND pg_get_constraintdef(c.oid) ILIKE '%ticto%'
  LOOP
    IF r.def ILIKE '%youshop%' THEN
      RAISE NOTICE 'Constraint % em % já aceita youshop — pulando', r.conname, r.tbl;
      CONTINUE;
    END IF;

    EXECUTE format('ALTER TABLE %s DROP CONSTRAINT %I', r.tbl, r.conname);

    -- funnel_products.platform é nullable (NULL = todas as plataformas)
    IF r.def ILIKE '%IS NULL%' THEN
      EXECUTE format(
        'ALTER TABLE %s ADD CONSTRAINT %I CHECK (platform IS NULL OR platform IN (%s))',
        r.tbl, r.conname, v_list
      );
    ELSE
      EXECUTE format(
        'ALTER TABLE %s ADD CONSTRAINT %I CHECK (platform IN (%s))',
        r.tbl, r.conname, v_list
      );
    END IF;

    RAISE NOTICE 'Constraint % em % recriada com youshop', r.conname, r.tbl;
  END LOOP;
END $$;

-- Sanidade: lista o estado final das constraints de platform
SELECT c.conrelid::regclass AS tabela, c.conname, pg_get_constraintdef(c.oid) AS definicao
  FROM pg_constraint c
  JOIN pg_namespace n ON n.oid = c.connamespace
 WHERE n.nspname = 'public'
   AND c.contype = 'c'
   AND pg_get_constraintdef(c.oid) ILIKE '%platform%'
 ORDER BY 1;
