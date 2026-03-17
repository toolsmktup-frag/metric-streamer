-- ═══════════════════════════════════════════════════════════════════
-- Tabela: cac_campaign_overrides
--
-- Permite atribuição manual de campanhas Meta a produtos para
-- cálculo de CAC. Tem precedência sobre keyword matching automático.
--
-- Fluxo:
--   1. CAC tab mostra campanhas "não atribuídas"
--   2. Usuário clica "Atribuir" → seleciona produto
--   3. Override é salvo nesta tabela
--   4. Próximo cálculo usa override em vez de tentar bater keyword
-- ═══════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.cac_campaign_overrides (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id     text NOT NULL UNIQUE,   -- meta_campaigns.id
  campaign_name   text NOT NULL,          -- snapshot do nome (para exibição)
  product_key     text NOT NULL,          -- chave do produto (ex: 'guia_tinturas')
  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cac_overrides_campaign ON public.cac_campaign_overrides(campaign_id);

ALTER TABLE public.cac_campaign_overrides ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated read overrides"
  ON public.cac_campaign_overrides FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated manage overrides"
  ON public.cac_campaign_overrides FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

COMMENT ON TABLE public.cac_campaign_overrides IS
  'Atribuição manual de campanhas Meta a produtos para CAC. '
  'Tem precedência sobre keyword matching automático.';
