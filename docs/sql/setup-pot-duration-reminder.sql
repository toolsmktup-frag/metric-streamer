-- ════════════════════════════════════════════════════════════════════
-- SETUP: Separa "duração do pote" de "lembrete X dias antes"
--
-- Antes: tinha um campo confuso `recontact_days` = 75, 155, 330...
-- Depois:
--   pot_duration_days     → quanto tempo o pote dura (30, 90, 180...)
--   reminder_days_before  → quantos dias antes do fim mandar o lembrete
--   recontact_days        → CALCULADO AUTOMÁTICO (duracao − lembrete)
--
-- A edge function `recontact-cron` continua lendo `recontact_days` como antes
-- (não precisa redeploy). Um trigger mantém o valor sempre sincronizado.
--
-- ⚠️  IDEMPOTENTE: pode rodar várias vezes.
-- ════════════════════════════════════════════════════════════════════

-- 1) Adicionar colunas novas
ALTER TABLE public.lead_funnel_products
  ADD COLUMN IF NOT EXISTS pot_duration_days int,
  ADD COLUMN IF NOT EXISTS reminder_days_before int;

COMMENT ON COLUMN public.lead_funnel_products.pot_duration_days IS
  'Quantos dias o pote/produto dura (ex: 30, 90, 180). Junto com reminder_days_before, calcula recontact_days.';

COMMENT ON COLUMN public.lead_funnel_products.reminder_days_before IS
  'Quantos dias ANTES do pote acabar mandar o lembrete (ex: 15). recontact_days = pot_duration_days - reminder_days_before.';

-- 2) Trigger que mantém recontact_days sempre = duração − lembrete
CREATE OR REPLACE FUNCTION public.sync_recontact_days_from_pot()
RETURNS TRIGGER
LANGUAGE plpgsql
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

-- 3) Popular os 6 produtos do funil RECOMPRA - POTES
--    Padrão: lembrete 15d antes; potes curtos (≤30d) usam 7d antes
DO $$
DECLARE
  v_funnel_id uuid := '19f75912-295e-4c67-acad-275ce6849c5c';
  v_updated int := 0;
  r record;
  v_duration int;
  v_reminder int;
BEGIN
  FOR r IN
    SELECT id, product_name_contains, display_name, recontact_days
    FROM public.lead_funnel_products
    WHERE lead_funnel_id = v_funnel_id
  LOOP
    -- Inferir duração pelo nome do produto
    v_duration := CASE
      WHEN r.product_name_contains ILIKE '%30 dias%' OR r.display_name ILIKE '%30 dias%' OR r.display_name ILIKE '%gratis%' THEN 30
      WHEN r.product_name_contains ILIKE '%90 dias%' OR r.display_name ILIKE '%90 dias%' THEN 90
      WHEN r.product_name_contains ILIKE '%180 dias%' OR r.display_name ILIKE '%180 dias%' THEN 180
      WHEN r.product_name_contains ILIKE '%360 dias%' OR r.display_name ILIKE '%360 dias%' THEN 360
      WHEN r.product_name_contains ILIKE '%9 potes%' OR r.display_name ILIKE '%9 potes%' THEN 270
      ELSE NULL
    END;

    IF v_duration IS NULL THEN
      RAISE NOTICE 'SKIP: produto "%" — não consegui inferir duração, ajuste manual', COALESCE(r.display_name, r.product_name_contains);
      CONTINUE;
    END IF;

    -- Lembrete: 7d antes pros curtos, 15d antes pros demais
    v_reminder := CASE
      WHEN v_duration <= 30 THEN 7
      WHEN v_duration >= 270 THEN 20
      ELSE 15
    END;

    UPDATE public.lead_funnel_products
    SET pot_duration_days = v_duration,
        reminder_days_before = v_reminder
        -- recontact_days será setado automaticamente pelo trigger
    WHERE id = r.id;

    v_updated := v_updated + 1;
    RAISE NOTICE 'OK: % → duração=%d, lembrete=%d antes (recontato em %d)',
      COALESCE(r.display_name, r.product_name_contains),
      v_duration, v_reminder, (v_duration - v_reminder);
  END LOOP;

  RAISE NOTICE '✅ Total de produtos atualizados: %', v_updated;
END;
$$;

-- 4) Conferência final
SELECT
  product_name_contains AS produto,
  display_name,
  pot_duration_days AS duracao,
  reminder_days_before AS lembrar_antes,
  recontact_days AS dias_p_recontato_calc
FROM public.lead_funnel_products
WHERE lead_funnel_id = '19f75912-295e-4c67-acad-275ce6849c5c'
ORDER BY pot_duration_days NULLS LAST, display_name;

-- ════════════════════════════════════════════════════════════════════
-- ROLLBACK (se precisar desfazer)
-- ════════════════════════════════════════════════════════════════════
-- DROP TRIGGER IF EXISTS trg_sync_recontact_days ON public.lead_funnel_products;
-- DROP FUNCTION IF EXISTS public.sync_recontact_days_from_pot();
-- ALTER TABLE public.lead_funnel_products
--   DROP COLUMN IF EXISTS pot_duration_days,
--   DROP COLUMN IF EXISTS reminder_days_before;
