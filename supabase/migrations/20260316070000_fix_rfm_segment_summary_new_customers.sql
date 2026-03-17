-- ═══════════════════════════════════════════════════════════════════
-- FIX: fn_rfm_segment_summary() — new_customers usa purchase_count = 1
--
-- Problema anterior: WHEN r_score >= 4 AND f_score = 1
--   f_score = 1 significa bottom 20% de frequência via NTILE(5),
--   não necessariamente clientes com apenas 1 compra.
--   Um cliente com 3 compras poderia cair no tile 1 se os outros
--   tiverem muitas compras, sendo erroneamente rotulado como "novo".
--
-- Correção: usar purchase_count = 1 (quantidade real de compras).
--
-- ROLLBACK: reexecutar 20260315230000_rfm_segment_summary_fn.sql
-- ═══════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.fn_rfm_segment_summary()
RETURNS TABLE (
  segment          text,
  customer_count   bigint,
  pct              numeric,
  total_revenue    numeric,
  avg_monetary     numeric,
  avg_recency_days numeric,
  avg_frequency    numeric
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
WITH raw AS (
  SELECT
    customer_id,
    total_revenue,
    purchase_count,
    EXTRACT(DAY FROM (NOW() - last_purchase_at))::integer AS recency_days
  FROM public.fn_rfm_customers()
),
scored AS (
  SELECT
    customer_id,
    total_revenue,
    purchase_count,
    recency_days,
    -- R: menos dias = mais recente = score maior (ORDER DESC: maior dias = tile 1 = score 1)
    NTILE(5) OVER (ORDER BY recency_days DESC)  AS r_score,
    NTILE(5) OVER (ORDER BY purchase_count ASC) AS f_score,
    NTILE(5) OVER (ORDER BY total_revenue  ASC) AS m_score
  FROM raw
),
segmented AS (
  SELECT
    customer_id,
    total_revenue,
    purchase_count,
    recency_days,
    r_score,
    f_score,
    m_score,
    CASE
      WHEN r_score >= 4 AND f_score >= 4 AND m_score >= 4  THEN 'champions'
      WHEN f_score >= 4 AND m_score >= 4                   THEN 'loyal'
      WHEN r_score >= 3 AND f_score >= 3 AND m_score >= 3  THEN 'loyal'
      -- new_customers: comprou exatamente 1 vez (purchase_count real, não tile)
      WHEN r_score >= 4 AND purchase_count = 1             THEN 'new_customers'
      WHEN r_score >= 3 AND f_score <= 2  AND m_score <= 3 THEN 'potential'
      WHEN r_score <= 2 AND (f_score >= 3 OR m_score >= 3) THEN 'at_risk'
      WHEN r_score = 1  AND f_score <= 2                   THEN 'lost'
      WHEN r_score <= 2 AND f_score <= 2                   THEN 'hibernating'
      ELSE 'regular'
    END AS segment
  FROM scored
),
total_count AS (SELECT COUNT(*) AS n FROM segmented)
SELECT
  s.segment,
  COUNT(*)::bigint                                       AS customer_count,
  ROUND(COUNT(*)::numeric / t.n * 100, 1)               AS pct,
  ROUND(SUM(s.total_revenue)::numeric, 2)               AS total_revenue,
  ROUND(AVG(s.total_revenue)::numeric, 2)               AS avg_monetary,
  ROUND(AVG(s.recency_days)::numeric, 0)                AS avg_recency_days,
  ROUND(AVG(s.purchase_count)::numeric, 2)              AS avg_frequency
FROM segmented s
CROSS JOIN total_count t
GROUP BY s.segment, t.n
ORDER BY total_revenue DESC;
$$;

COMMENT ON FUNCTION public.fn_rfm_segment_summary() IS
  'Retorna estatísticas agregadas por segmento RFM (Guru + Ticto). '
  'Usa NTILE(5) para scoring R/F/M. new_customers = purchase_count = 1. '
  'Usada pelo Agente IA como contexto.';

GRANT EXECUTE ON FUNCTION public.fn_rfm_segment_summary() TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_rfm_segment_summary() TO service_role;
