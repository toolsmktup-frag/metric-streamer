-- find_lead_by_phone: casa um lead por telefone independente do formato gravado.
-- Motivo: leads.phone tem números formatados ("+55 (21) 99675-1303"), com DDI
-- espúrio ("+1 55...") e com/sem 9º dígito. O lookup por igualdade (.in) do chat
-- não casava → lateral vazia, dedup criava duplicados. Esta função canonicaliza
-- os dois lados (55 + DDD + últimos 8) e compara — mesma regra do src/lib/phone.ts.

-- Canoniza para "DDD + 8 últimos dígitos" (colapsa 9º dígito e DDI), tratando
-- DDI espúrio "1" na frente de um número BR.
CREATE OR REPLACE FUNCTION public.br_phone_key(p_phone text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  d text;
  ddd text;
  local8 text;
BEGIN
  d := regexp_replace(COALESCE(p_phone, ''), '\D', '', 'g');
  IF d = '' THEN RETURN NULL; END IF;
  -- DDI espúrio 1 na frente de 55+BR
  IF left(d,1) = '1' AND length(d) >= 13 AND substr(d,2,2) = '55' THEN
    d := substr(d, 2);
  END IF;
  -- descasca DDI 55
  IF left(d,2) = '55' AND length(d) >= 12 THEN
    d := substr(d, 3);
  END IF;
  IF length(d) < 10 OR length(d) > 11 THEN
    RETURN d; -- não parece BR: devolve dígitos como chave (melhor que nada)
  END IF;
  ddd := left(d, 2);
  local8 := right(d, 8); -- colapsa o 9º dígito
  RETURN ddd || local8;
END;
$$;

CREATE OR REPLACE FUNCTION public.find_lead_by_phone(p_phone text)
RETURNS SETOF public.leads
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  -- Quando há duplicados pelo mesmo telefone (formatado vs limpo), prefere o
  -- lead "rico": com nome, com dono, e o mais antigo (o original — o duplicado
  -- vazio costuma nascer depois via ensure_lead).
  SELECT *
  FROM public.leads
  WHERE p_phone IS NOT NULL
    AND br_phone_key(phone) IS NOT NULL
    AND br_phone_key(phone) = br_phone_key(p_phone)
  ORDER BY
    (name IS NOT NULL AND btrim(name) <> '') DESC,
    (assigned_to IS NOT NULL) DESC,
    created_at ASC
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.br_phone_key(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.find_lead_by_phone(text) TO authenticated, service_role;
