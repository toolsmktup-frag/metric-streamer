-- ═══════════════════════════════════════════════════════════════════
-- FIX: fn_rfm_segment_summary() — threshold "loyal" ajustado
--
-- Problema anterior:
--   WHEN r_score >= 3 AND f_score >= 3 AND m_score >= 3 → 'loyal'
--   Captura top 60% nos 3 critérios = ~35% da base rotulada como "leal"
--
-- Correção:
--   loyal = r >= 3 AND f >= 4 AND m >= 4  (recente-ish + top 40% em F e M)
--   Clientes f >= 4 AND m >= 4 mas r <= 2 → at_risk (eram bons, sumiram)
--   Clientes r >= 3, f = 3, m = 3 → regular (perfil médio, catch-all)
--
-- ROLLBACK: reexecutar 20260316070000_fix_rfm_segment_summary_new_customers.sql
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
      -- Champions: top 40% em recência, frequência e monetário
      WHEN r_score >= 4 AND f_score >= 4 AND m_score >= 4  THEN 'champions'
      -- Loyal: moderadamente recente + top 40% em F e M
      WHEN r_score >= 3 AND f_score >= 4 AND m_score >= 4  THEN 'loyal'
      -- New: comprou exatamente 1 vez, está entre os mais recentes
      WHEN r_score >= 4 AND purchase_count = 1             THEN 'new_customers'
      -- Potential: recente mas com poucas compras
      WHEN r_score >= 3 AND f_score <= 2  AND m_score <= 3 THEN 'potential'
      -- At risk: eram top em F ou M mas sumiram (ex-campeões/leais inativos)
      WHEN r_score <= 2 AND (f_score >= 3 OR m_score >= 3) THEN 'at_risk'
      -- Lost: muito antigos, baixo engajamento
      WHEN r_score = 1  AND f_score <= 2                   THEN 'lost'
      -- Hibernating: inativos com baixa frequência
      WHEN r_score <= 2 AND f_score <= 2                   THEN 'hibernating'
      -- Regular: perfil médio — catch-all
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
  'Retorna estatísticas por segmento RFM (Guru + Ticto). '
  'loyal = r>=3 AND f>=4 AND m>=4. new_customers = purchase_count=1. '
  'Usada pelo Agente IA como contexto.';

GRANT EXECUTE ON FUNCTION public.fn_rfm_segment_summary() TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_rfm_segment_summary() TO service_role;
