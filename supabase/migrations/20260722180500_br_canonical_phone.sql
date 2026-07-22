CREATE OR REPLACE FUNCTION public.br_canonical_phone(p_phone text)
RETURNS text LANGUAGE plpgsql IMMUTABLE AS $fn$
DECLARE d text;
BEGIN
  d := regexp_replace(COALESCE(p_phone,''),'\D','','g');
  IF d = '' THEN RETURN p_phone; END IF;
  IF left(d,1)='1' AND length(d)>=13 AND substr(d,2,2)='55' THEN d := substr(d,2); END IF;
  IF left(d,2)='55' AND (length(d)=12 OR length(d)=13) THEN RETURN d; END IF;
  IF length(d)=10 OR length(d)=11 THEN RETURN '55'||d; END IF;
  RETURN d;
END; $fn$;
GRANT EXECUTE ON FUNCTION public.br_canonical_phone(text) TO authenticated, service_role;
