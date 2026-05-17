-- ═══════════════════════════════════════════════════════════════════
-- REORGANIZAR FUNIL INFOPRODUTOS
-- Move leads para a etapa certa baseado no status da última venda
-- (cruzando v_all_sales por email OU telefone normalizado).
--
-- Funil: Infoprodutos (b4452a0a-1e4f-4e91-a53e-e873256e90c5)
-- Execução: 1x manual, no SQL Editor do Supabase
-- ═══════════════════════════════════════════════════════════════════

-- ── 0. BACKUP (pra reverter se precisar) ──
DROP TABLE IF EXISTS backup_lsp_infoprodutos;
CREATE TABLE backup_lsp_infoprodutos AS
SELECT * FROM public.lead_stage_positions
WHERE funnel_id = 'b4452a0a-1e4f-4e91-a53e-e873256e90c5';

-- Pra reverter:
-- DELETE FROM lead_stage_positions WHERE funnel_id = 'b4452a0a-1e4f-4e91-a53e-e873256e90c5';
-- INSERT INTO lead_stage_positions SELECT * FROM backup_lsp_infoprodutos;

-- ── 1. Conferir as etapas descobertas (rode antes do UPDATE) ──
WITH funnel AS (SELECT 'b4452a0a-1e4f-4e91-a53e-e873256e90c5'::uuid AS id)
SELECT
  (SELECT id FROM public.lead_funnel_stages WHERE funnel_id = (SELECT id FROM funnel) AND lower(name) LIKE '%aprovad%' LIMIT 1) AS aprovada_id,
  (SELECT id FROM public.lead_funnel_stages WHERE funnel_id = (SELECT id FROM funnel) AND (lower(name) LIKE '%pix%' OR lower(name) LIKE '%boleto%') LIMIT 1) AS pix_id,
  (SELECT id FROM public.lead_funnel_stages WHERE funnel_id = (SELECT id FROM funnel) AND lower(name) LIKE '%abandon%' LIMIT 1) AS abandono_id,
  (SELECT id FROM public.lead_funnel_stages WHERE funnel_id = (SELECT id FROM funnel) AND (lower(name) LIKE '%recusad%' OR lower(name) LIKE '%cancel%') LIMIT 1) AS recusada_id;

-- ── 2. UPDATE principal ──
WITH funnel AS (
  SELECT 'b4452a0a-1e4f-4e91-a53e-e873256e90c5'::uuid AS id
),
target AS (
  SELECT
    (SELECT id FROM public.lead_funnel_stages WHERE funnel_id = (SELECT id FROM funnel) AND lower(name) LIKE '%aprovad%' LIMIT 1) AS aprovada,
    (SELECT id FROM public.lead_funnel_stages WHERE funnel_id = (SELECT id FROM funnel) AND (lower(name) LIKE '%pix%' OR lower(name) LIKE '%boleto%') LIMIT 1) AS pix,
    (SELECT id FROM public.lead_funnel_stages WHERE funnel_id = (SELECT id FROM funnel) AND lower(name) LIKE '%abandon%' LIMIT 1) AS abandono,
    (SELECT id FROM public.lead_funnel_stages WHERE funnel_id = (SELECT id FROM funnel) AND (lower(name) LIKE '%recusad%' OR lower(name) LIKE '%cancel%') LIMIT 1) AS recusada
),
funnel_leads AS (
  SELECT DISTINCT p.lead_id, l.email, l.phone
  FROM public.lead_stage_positions p
  JOIN public.leads l ON l.id = p.lead_id
  WHERE p.funnel_id = (SELECT id FROM funnel)
),
last_sale AS (
  SELECT DISTINCT ON (fl.lead_id)
    fl.lead_id,
    lower(v.status) AS status
  FROM funnel_leads fl
  JOIN public.v_all_sales v
    ON (fl.email IS NOT NULL AND lower(v.customer_email) = lower(fl.email))
    OR (fl.phone IS NOT NULL AND v.customer_phone IS NOT NULL
        AND regexp_replace(v.customer_phone, '\D', '', 'g') = regexp_replace(fl.phone, '\D', '', 'g')
        AND length(regexp_replace(fl.phone, '\D', '', 'g')) >= 10)
  ORDER BY fl.lead_id, v.purchased_at DESC NULLS LAST
),
mapped AS (
  SELECT
    ls.lead_id,
    CASE
      WHEN ls.status IN ('authorized','approved','paid','aprovada','aprovado') THEN t.aprovada
      WHEN ls.status IN ('pix_created','bank_slip_created','pending','waiting_payment','pix_generated','boleto_generated') THEN t.pix
      WHEN ls.status IN ('refused','rejected','canceled','cancelled','refunded','cancelada','rejeitada') THEN t.recusada
      WHEN ls.status IN ('abandoned','abandoned_cart','cart_abandoned') THEN t.abandono
      ELSE NULL
    END AS new_stage_id
  FROM last_sale ls
  CROSS JOIN target t
)
UPDATE public.lead_stage_positions p
SET
  stage_id = m.new_stage_id,
  entered_at = CASE WHEN p.stage_id != m.new_stage_id THEN now() ELSE p.entered_at END,
  updated_at = now()
FROM mapped m
WHERE p.lead_id = m.lead_id
  AND p.funnel_id = 'b4452a0a-1e4f-4e91-a53e-e873256e90c5'
  AND m.new_stage_id IS NOT NULL
  AND p.stage_id IS DISTINCT FROM m.new_stage_id;

-- ── 3. Conferência: distribuição final por etapa ──
SELECT
  s.name AS etapa,
  count(*) AS leads
FROM public.lead_stage_positions p
JOIN public.lead_funnel_stages s ON s.id = p.stage_id
WHERE p.funnel_id = 'b4452a0a-1e4f-4e91-a53e-e873256e90c5'
GROUP BY s.name, s.sort_order
ORDER BY s.sort_order;
