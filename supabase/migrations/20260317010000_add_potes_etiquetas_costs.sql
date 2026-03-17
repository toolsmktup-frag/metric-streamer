-- ─────────────────────────────────────────────────────────────────
-- Adiciona estoque dedicado de potes e etiquetas em physical_products
-- e custos unitários específicos em product_cost_config
-- ─────────────────────────────────────────────────────────────────

-- Estoque de insumos direto no produto
ALTER TABLE public.physical_products
  ADD COLUMN IF NOT EXISTS stock_potes      integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS min_potes        integer NOT NULL DEFAULT 50,
  ADD COLUMN IF NOT EXISTS stock_etiquetas  integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS min_etiquetas    integer NOT NULL DEFAULT 50;

-- Custos unitários específicos
ALTER TABLE public.product_cost_config
  ADD COLUMN IF NOT EXISTS cost_supplement  numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cost_bottle      numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cost_label       numeric NOT NULL DEFAULT 0;
