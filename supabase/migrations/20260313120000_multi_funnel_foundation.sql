-- ═══════════════════════════════════════════════════════════════════
-- MULTI-FUNNEL FOUNDATION
-- Estratégia: additive only — não remove nem altera dados existentes
-- ═══════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────
-- 1. FUNNELS
-- Cada funil representa um produto/campanha com sua própria conta
-- Meta e plataforma de pagamento configurada.
-- ─────────────────────────────────────────────────────────────────
CREATE TABLE public.funnels (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE
                  DEFAULT '00000000-0000-0000-0000-000000000001',
  name            text NOT NULL,
  description     text,
  color           text NOT NULL DEFAULT '#6366f1',  -- cor no sidebar
  meta_account_id text,                              -- ID da conta Meta vinculada
  platform        text NOT NULL DEFAULT 'ticto'
                  CHECK (platform IN ('ticto', 'guru', 'kiwify', 'hotmart', 'eduzz', 'outro')),
  webhook_token   text UNIQUE DEFAULT gen_random_uuid()::text, -- token único por funil
  is_active       boolean NOT NULL DEFAULT true,
  sort_order      int NOT NULL DEFAULT 0,            -- ordem no sidebar
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_funnels_org    ON public.funnels(organization_id);
CREATE INDEX idx_funnels_active ON public.funnels(is_active) WHERE is_active = true;

ALTER TABLE public.funnels ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated read funnels"
  ON public.funnels FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated manage funnels"
  ON public.funnels FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

CREATE POLICY "Service full access funnels"
  ON public.funnels FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- ─────────────────────────────────────────────────────────────────
-- 2. FUNNEL PRODUCTS
-- Fragmentos de nome para matching ILIKE — suporta variações de nome
-- como "COMO PREPARAR TINTURAS..." e "Guia de Tinturas".
-- ─────────────────────────────────────────────────────────────────
CREATE TABLE public.funnel_products (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  funnel_id             uuid NOT NULL REFERENCES public.funnels(id) ON DELETE CASCADE,
  product_name_contains text NOT NULL,  -- fragmento: product_name ILIKE '%fragmento%'
  role                  text NOT NULL DEFAULT 'front'
                        CHECK (role IN ('front', 'order_bump', 'upsell1', 'upsell2', 'upsell3', 'downsell')),
  display_name          text,           -- nome amigável para exibir no dashboard
  created_at            timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_funnel_products_funnel ON public.funnel_products(funnel_id);

ALTER TABLE public.funnel_products ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated read funnel_products"
  ON public.funnel_products FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated manage funnel_products"
  ON public.funnel_products FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

CREATE POLICY "Service full access funnel_products"
  ON public.funnel_products FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- ─────────────────────────────────────────────────────────────────
-- 3. ADICIONAR funnel_id NAS TABELAS EXISTENTES (nullable)
-- Não quebra nada. Transações sem funil = visíveis no Resumo Geral.
-- ─────────────────────────────────────────────────────────────────
ALTER TABLE public.ticto_transactions
  ADD COLUMN IF NOT EXISTS funnel_id uuid
  REFERENCES public.funnels(id) ON DELETE SET NULL;

ALTER TABLE public.customer_purchases
  ADD COLUMN IF NOT EXISTS funnel_id uuid
  REFERENCES public.funnels(id) ON DELETE SET NULL;

CREATE INDEX idx_ticto_funnel     ON public.ticto_transactions(funnel_id);
CREATE INDEX idx_purchases_funnel ON public.customer_purchases(funnel_id);

-- ─────────────────────────────────────────────────────────────────
-- 4. FUNÇÃO: resolve_funnel_id
-- Dado um product_name, retorna o funnel_id correspondente via ILIKE.
-- Usada nos webhooks e no script retroativo.
-- ─────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.resolve_funnel_id(p_product_name text)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT fp.funnel_id
  FROM public.funnel_products fp
  JOIN public.funnels f ON f.id = fp.funnel_id
  WHERE f.is_active = true
    AND p_product_name ILIKE '%' || fp.product_name_contains || '%'
  ORDER BY length(fp.product_name_contains) DESC  -- match mais específico primeiro
  LIMIT 1;
$$;

-- ─────────────────────────────────────────────────────────────────
-- 5. FUNÇÃO: tag_historical_transactions
-- Script retroativo: percorre ticto_transactions sem funnel_id
-- e tenta associar via product_name ILIKE funnel_products.
-- Executar manualmente após configurar os funis:
--   SELECT public.tag_historical_transactions();
-- ─────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.tag_historical_transactions()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_updated int := 0;
  v_skipped int := 0;
BEGIN
  WITH matches AS (
    SELECT
      tt.transaction_hash,
      public.resolve_funnel_id(tt.product_name) AS matched_funnel_id
    FROM public.ticto_transactions tt
    WHERE tt.funnel_id IS NULL
      AND tt.product_name IS NOT NULL
  ),
  updated AS (
    UPDATE public.ticto_transactions tt
    SET funnel_id = m.matched_funnel_id, updated_at = now()
    FROM matches m
    WHERE tt.transaction_hash = m.transaction_hash
      AND m.matched_funnel_id IS NOT NULL
    RETURNING 1
  )
  SELECT COUNT(*) INTO v_updated FROM updated;

  SELECT COUNT(*) INTO v_skipped
  FROM public.ticto_transactions
  WHERE funnel_id IS NULL;

  RETURN jsonb_build_object(
    'tagged', v_updated,
    'still_untagged', v_skipped,
    'message', format('Associadas %s transações. %s sem funil correspondente.', v_updated, v_skipped)
  );
END;
$$;

-- ─────────────────────────────────────────────────────────────────
-- 6. SEED: Funil Guia de Tinturas (primeiro funil configurado)
-- Inserir com ID fixo para facilitar referência.
-- Ajuste o meta_account_id com o ID real da sua conta Meta.
-- ─────────────────────────────────────────────────────────────────
INSERT INTO public.funnels (
  id, name, description, color, platform, sort_order
) VALUES (
  '10000000-0000-0000-0000-000000000001',
  'Guia de Tinturas',
  'Funil principal — Guia de Tinturas + Guia de Chás + Curso Mestre',
  '#8b5cf6',
  'ticto',
  1
);

-- Produtos do funil Guia de Tinturas
-- Fragmentos conservadores para cobrir variações de nome
INSERT INTO public.funnel_products (funnel_id, product_name_contains, role, display_name) VALUES
  ('10000000-0000-0000-0000-000000000001', 'TINTURA',  'front',      'Guia de Tinturas'),
  ('10000000-0000-0000-0000-000000000001', 'CHÁ',      'order_bump', 'Guia de Chás'),
  ('10000000-0000-0000-0000-000000000001', 'MESTRE',   'upsell1',    'Curso Mestre das Tinturas');

-- ─────────────────────────────────────────────────────────────────
-- NOTA: Após aplicar esta migration, execute no SQL Editor:
--   SELECT public.tag_historical_transactions();
-- para associar transações históricas ao funil automaticamente.
-- ─────────────────────────────────────────────────────────────────
