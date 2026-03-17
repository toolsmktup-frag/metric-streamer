-- ═══════════════════════════════════════════════════════════════════
-- FIX: customer_identity_links — normalização e validação de identifiers
--
-- Bug #10: sem trigger de normalização — inserts manuais podiam salvar
--   email com maiúsculas, CPF com pontos/traços, phone com espaços.
--   JOINs posteriores com LOWER(TRIM()) falhavam silenciosamente.
--
-- Bug #16: sem validação de formato — nome salvo como 'email', telefone
--   salvo como 'cpf', etc. (ex: "denise correa de morais" com type='email').
--
-- Fix:
--   1. Trigger de normalização BEFORE INSERT OR UPDATE:
--      - email → LOWER(TRIM())
--      - cpf   → só dígitos, deve ter 11
--      - phone → só dígitos
--   2. Validação: email deve conter '@'; cpf deve ter 11 dígitos
--   3. Limpeza de registros inválidos existentes (move para type='name')
--
-- ROLLBACK: DROP TRIGGER / DROP FUNCTION normalize_identity_identifier;
-- ═══════════════════════════════════════════════════════════════════

-- ── 1. Função de normalização ──────────────────────────────────────
CREATE OR REPLACE FUNCTION public.normalize_identity_identifier()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.identifier_type = 'email' THEN
    NEW.identifier_value := LOWER(TRIM(NEW.identifier_value));

    -- Rejeita se não tem '@' (nome salvo como email)
    IF NEW.identifier_value NOT LIKE '%@%' THEN
      RAISE EXCEPTION
        'identifier_value inválido para type=email: "%". Deve conter "@".',
        NEW.identifier_value;
    END IF;

  ELSIF NEW.identifier_type = 'cpf' THEN
    -- Remove qualquer caractere não numérico
    NEW.identifier_value := regexp_replace(NEW.identifier_value, '[^0-9]', '', 'g');

    -- CPF deve ter exatamente 11 dígitos
    IF length(NEW.identifier_value) <> 11 THEN
      RAISE EXCEPTION
        'identifier_value inválido para type=cpf: "%". CPF deve ter 11 dígitos (sem pontos/traços), recebeu % dígitos.',
        NEW.identifier_value, length(NEW.identifier_value);
    END IF;

  ELSIF NEW.identifier_type = 'phone' THEN
    -- Remove qualquer caractere não numérico
    NEW.identifier_value := regexp_replace(NEW.identifier_value, '[^0-9]', '', 'g');
  END IF;

  RETURN NEW;
END;
$$;

-- ── 2. Trigger na tabela ───────────────────────────────────────────
DROP TRIGGER IF EXISTS trg_normalize_identity ON public.customer_identity_links;

CREATE TRIGGER trg_normalize_identity
  BEFORE INSERT OR UPDATE ON public.customer_identity_links
  FOR EACH ROW EXECUTE FUNCTION public.normalize_identity_identifier();

-- ── 3. Limpeza dos registros inválidos existentes ──────────────────
-- Identifiers do tipo 'email' que não têm '@' são na verdade nomes.
-- Move identifier_type para 'name' para não quebrar JOINs de email.
-- Se já existe um link 'name' para o mesmo cliente, deleta o inválido.

UPDATE public.customer_identity_links
SET identifier_type = 'name'
WHERE identifier_type = 'email'
  AND identifier_value NOT LIKE '%@%';

-- Identifiers do tipo 'cpf' com número de dígitos diferente de 11
-- (pode ser telefone armazenado errado).
-- Se já existe um link 'phone' igual → simplesmente deleta o inválido.
-- Se não existe → move para 'phone'.
DELETE FROM public.customer_identity_links
WHERE identifier_type = 'cpf'
  AND length(regexp_replace(identifier_value, '[^0-9]', '', 'g')) <> 11
  AND EXISTS (
    SELECT 1 FROM public.customer_identity_links c2
    WHERE c2.organization_id   = customer_identity_links.organization_id
      AND c2.identifier_type   = 'phone'
      AND c2.identifier_value  = regexp_replace(customer_identity_links.identifier_value, '[^0-9]', '', 'g')
  );

UPDATE public.customer_identity_links
SET identifier_type  = 'phone',
    identifier_value = regexp_replace(identifier_value, '[^0-9]', '', 'g')
WHERE identifier_type = 'cpf'
  AND length(regexp_replace(identifier_value, '[^0-9]', '', 'g')) BETWEEN 10 AND 13
  AND length(regexp_replace(identifier_value, '[^0-9]', '', 'g')) <> 11;

-- Deleta CPFs com formato realmente inválido (não é CPF nem telefone)
DELETE FROM public.customer_identity_links
WHERE identifier_type = 'cpf'
  AND length(regexp_replace(identifier_value, '[^0-9]', '', 'g')) NOT BETWEEN 10 AND 13
  AND length(regexp_replace(identifier_value, '[^0-9]', '', 'g')) <> 11;

-- ── 4. View auxiliar: clientes pendentes de revisão ───────────────
-- Bug #11: needs_review = true marcado mas nunca visualizado.
CREATE OR REPLACE VIEW public.v_customers_needs_review AS
SELECT
  uc.id,
  uc.primary_email,
  uc.full_name,
  uc.identity_confidence,
  uc.review_reason,
  uc.total_spent,
  uc.total_orders,
  uc.updated_at
FROM public.unified_customers uc
WHERE uc.needs_review = true
ORDER BY uc.total_spent DESC;

COMMENT ON VIEW public.v_customers_needs_review IS
  'Clientes com identidade de confiança média/baixa aguardando revisão manual. '
  'Ordenado por maior gasto para priorizar os mais valiosos.';

GRANT SELECT ON public.v_customers_needs_review TO authenticated;
GRANT SELECT ON public.v_customers_needs_review TO service_role;

COMMENT ON FUNCTION public.normalize_identity_identifier() IS
  'Trigger BEFORE INSERT/UPDATE em customer_identity_links. '
  'Normaliza email (lowercase+trim), CPF (só dígitos, 11 chars), phone (só dígitos). '
  'Rejeita email sem "@" e CPF com tamanho errado.';
