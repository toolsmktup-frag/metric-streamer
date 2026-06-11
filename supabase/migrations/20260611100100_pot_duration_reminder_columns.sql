-- ════════════════════════════════════════════════════════════════════
-- Recompra/Recontato — Fase 1: separar "duração do pote" de "antecedência"
--
-- Antes: recontact_days era um número solto, casado por TEXTO do nome do
-- produto ("Articulabem Pote 90 dias") — que nunca bate com o nome real da
-- compra ("3 potes ArticulaBEM"). Agora a config passa a ser indexada por
-- duração:
--   pot_duration_days    → quantos dias o estoque dura (quantidade * 30)
--   reminder_days_before → quantos dias antes do fim recontatar
--   recontact_days       → CALCULADO (duração − antecedência), mantido por trigger
--
-- Promove docs/sql/setup-pot-duration-reminder.sql (nunca aplicado) a migration
-- versionada. A POPULAÇÃO dos produtos fica numa migration posterior (Fase 5).
-- IDEMPOTENTE.
-- ════════════════════════════════════════════════════════════════════

ALTER TABLE public.lead_funnel_products
  ADD COLUMN IF NOT EXISTS pot_duration_days int,
  ADD COLUMN IF NOT EXISTS reminder_days_before int;

COMMENT ON COLUMN public.lead_funnel_products.pot_duration_days IS
  'Quantos dias o estoque do produto dura (quantidade de potes * 30). Base do recontato.';
COMMENT ON COLUMN public.lead_funnel_products.reminder_days_before IS
  'Quantos dias ANTES do fim do estoque recontatar. recontact_days = pot_duration_days - reminder_days_before.';

CREATE OR REPLACE FUNCTION public.sync_recontact_days_from_pot()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.pot_duration_days IS NOT NULL AND NEW.reminder_days_before IS NOT NULL THEN
    NEW.recontact_days := GREATEST(NEW.pot_duration_days - NEW.reminder_days_before, 1);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_recontact_days ON public.lead_funnel_products;
CREATE TRIGGER trg_sync_recontact_days
  BEFORE INSERT OR UPDATE OF pot_duration_days, reminder_days_before
  ON public.lead_funnel_products
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_recontact_days_from_pot();

-- ROLLBACK:
-- DROP TRIGGER IF EXISTS trg_sync_recontact_days ON public.lead_funnel_products;
-- DROP FUNCTION IF EXISTS public.sync_recontact_days_from_pot();
-- ALTER TABLE public.lead_funnel_products DROP COLUMN IF EXISTS pot_duration_days, DROP COLUMN IF EXISTS reminder_days_before;
