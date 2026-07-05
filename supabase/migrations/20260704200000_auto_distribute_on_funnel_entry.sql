-- ═══════════════════════════════════════════════════════════════════
-- Distribuição automática de vendedora na ENTRADA do lead em funil
-- com auto_distribute_leads = true (incidente CRM recompra 04/07).
--
-- Problema: assign_lead_by_distribution (PR #38) só era chamada pelo
-- webhook-lead (captação). Leads que entram em funil pelo caminho de
-- COMPRA (sync_lead_from_sale) ficavam sem dono, ou presos com dona
-- BLOQUEADA (ex.: Luisa, 214 leads invisíveis pro kanban das ativas).
--
-- Solução: trigger em lead_stage_positions — qualquer caminho de
-- entrada passa por aqui. Se o funil distribui automaticamente:
--   • dono atual inativo/bloqueado → limpa o dono;
--   • sem dono → chama assign_lead_by_distribution (pesos do funil,
--     só perfis ativos, contadores balanceados).
-- ═══════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.auto_distribute_on_funnel_entry()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_enabled      boolean;
  v_owner        uuid;
  v_owner_status text;
BEGIN
  SELECT coalesce(auto_distribute_leads, false) INTO v_enabled
  FROM public.lead_funnels
  WHERE id = NEW.funnel_id;

  IF NOT coalesce(v_enabled, false) THEN
    RETURN NEW;
  END IF;

  SELECT assigned_to INTO v_owner
  FROM public.leads
  WHERE id = NEW.lead_id;

  IF v_owner IS NOT NULL THEN
    SELECT status INTO v_owner_status
    FROM public.user_profiles
    WHERE id = v_owner;

    IF v_owner_status IS DISTINCT FROM 'active' THEN
      UPDATE public.leads
      SET assigned_to = NULL, updated_at = now()
      WHERE id = NEW.lead_id;
      v_owner := NULL;
    END IF;
  END IF;

  IF v_owner IS NULL THEN
    PERFORM public.assign_lead_by_distribution(NEW.funnel_id, NEW.lead_id);
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_auto_distribute_on_entry ON public.lead_stage_positions;
CREATE TRIGGER trg_auto_distribute_on_entry
  AFTER INSERT ON public.lead_stage_positions
  FOR EACH ROW EXECUTE FUNCTION public.auto_distribute_on_funnel_entry();

COMMENT ON FUNCTION public.auto_distribute_on_funnel_entry() IS
  'Na entrada de lead em funil com auto_distribute_leads: limpa dono bloqueado/inativo '
  'e distribui por peso via assign_lead_by_distribution. Cobre captação, compra e backfills.';
