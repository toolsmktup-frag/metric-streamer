-- ═══════════════════════════════════════════════════════════════════
-- ECOMMERCE / INVENTORY MANAGEMENT
-- Controle de estoque para produtos físicos (suplementos)
--
-- ROLLBACK:
--   DROP TABLE IF EXISTS component_movements, inventory_movements,
--     product_cost_config, product_offer_mappings,
--     product_components, physical_products CASCADE;
-- ═══════════════════════════════════════════════════════════════════

-- ── 1. Produtos físicos ──────────────────────────────────────────
CREATE TABLE public.physical_products (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name              text NOT NULL,
  sku               text,
  active            boolean NOT NULL DEFAULT true,
  current_stock     integer NOT NULL DEFAULT 0,
  min_stock_alert   integer NOT NULL DEFAULT 50,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

-- ── 2. Mapeamento de ofertas (nome na plataforma → quantidade) ───
-- Ex: "3 potes Articulabem" → product_id, quantity=3
CREATE TABLE public.product_offer_mappings (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id  uuid NOT NULL REFERENCES public.physical_products(id) ON DELETE CASCADE,
  platform    text NOT NULL DEFAULT 'both', -- 'ticto' | 'guru' | 'both'
  offer_name  text NOT NULL,                -- nome exato na plataforma
  quantity    integer NOT NULL DEFAULT 1,   -- quantas unidades representa
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (product_id, offer_name)
);

-- ── 3. Insumos (componentes) por produto ────────────────────────
CREATE TABLE public.product_components (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id       uuid NOT NULL REFERENCES public.physical_products(id) ON DELETE CASCADE,
  name             text NOT NULL,            -- 'Pote', 'Rótulo', 'Fórmula'
  unit             text NOT NULL DEFAULT 'unidade',
  current_stock    numeric NOT NULL DEFAULT 0,
  min_stock_alert  numeric NOT NULL DEFAULT 100,
  cost_per_unit    numeric NOT NULL DEFAULT 0,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

-- ── 4. Configuração de custos por produto ───────────────────────
CREATE TABLE public.product_cost_config (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id           uuid NOT NULL REFERENCES public.physical_products(id) ON DELETE CASCADE UNIQUE,
  sale_price           numeric NOT NULL DEFAULT 0,
  platform_fee_pct     numeric NOT NULL DEFAULT 0,
  shipping_admin_cost  numeric NOT NULL DEFAULT 0,
  tax_pct              numeric NOT NULL DEFAULT 0,
  updated_at           timestamptz NOT NULL DEFAULT now()
);

-- ── 5. Movimentos de estoque (produto acabado) ──────────────────
CREATE TABLE public.inventory_movements (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id    uuid NOT NULL REFERENCES public.physical_products(id) ON DELETE CASCADE,
  type          text NOT NULL, -- 'in' | 'out' | 'adjustment' | 'production'
  quantity      integer NOT NULL,
  source        text NOT NULL, -- 'manual' | 'ticto_sale' | 'guru_sale' | 'production'
  reference_id  text,          -- ID da transação ou lote de produção
  notes         text,
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- ── 6. Movimentos de insumos ────────────────────────────────────
CREATE TABLE public.component_movements (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  component_id  uuid NOT NULL REFERENCES public.product_components(id) ON DELETE CASCADE,
  type          text NOT NULL, -- 'in' | 'out' | 'adjustment' | 'production_use'
  quantity      numeric NOT NULL,
  source        text NOT NULL, -- 'manual' | 'production'
  reference_id  text,
  notes         text,
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- ── Índices ──────────────────────────────────────────────────────
CREATE INDEX ON public.physical_products (user_id);
CREATE INDEX ON public.product_offer_mappings (product_id);
CREATE INDEX ON public.product_offer_mappings (offer_name);
CREATE INDEX ON public.product_components (product_id);
CREATE INDEX ON public.inventory_movements (product_id, created_at DESC);
CREATE INDEX ON public.component_movements (component_id, created_at DESC);

-- ── RLS ──────────────────────────────────────────────────────────
ALTER TABLE public.physical_products      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_offer_mappings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_components     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_cost_config    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_movements    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.component_movements    ENABLE ROW LEVEL SECURITY;

-- physical_products: owner only
CREATE POLICY "owner" ON public.physical_products
  USING (user_id = auth.uid());

-- tabelas filhas: acesso via product_id → physical_products.user_id
CREATE POLICY "owner" ON public.product_offer_mappings
  USING (product_id IN (SELECT id FROM public.physical_products WHERE user_id = auth.uid()));

CREATE POLICY "owner" ON public.product_components
  USING (product_id IN (SELECT id FROM public.physical_products WHERE user_id = auth.uid()));

CREATE POLICY "owner" ON public.product_cost_config
  USING (product_id IN (SELECT id FROM public.physical_products WHERE user_id = auth.uid()));

CREATE POLICY "owner" ON public.inventory_movements
  USING (product_id IN (SELECT id FROM public.physical_products WHERE user_id = auth.uid()));

CREATE POLICY "owner" ON public.component_movements
  USING (component_id IN (
    SELECT pc.id FROM public.product_components pc
    JOIN public.physical_products pp ON pp.id = pc.product_id
    WHERE pp.user_id = auth.uid()
  ));
