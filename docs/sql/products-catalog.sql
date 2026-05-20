-- ────────────────────────────────────────────────────────────────────
-- Catálogo de produtos desacoplado dos funis de tráfego
-- Permite cadastrar produtos (upsell/bump/e-mail) sem precisar criar
-- um funil de tráfego só pra eles. Esses produtos aparecem nos seletores
-- de funil de leads e automações WhatsApp normalmente.
--
-- Cole no Supabase Dashboard → SQL Editor → Run.
-- Date: 2026-05-20
-- ────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.products_catalog (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id             text,
  platform               text NOT NULL DEFAULT 'outro'
                         CHECK (platform IN ('ticto','guru','kiwify','hotmart','eduzz','outro')),
  display_name           text NOT NULL,
  product_name_contains  text NOT NULL,
  default_role           text CHECK (default_role IN ('front','order_bump','upsell1','upsell2','upsell3','downsell')),
  recontact_days         int,
  notes                  text,
  is_active              boolean NOT NULL DEFAULT true,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_products_catalog_pid_platform
  ON public.products_catalog(product_id, platform)
  WHERE product_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_products_catalog_active
  ON public.products_catalog(is_active) WHERE is_active = true;

ALTER TABLE public.products_catalog ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated read products_catalog"   ON public.products_catalog;
DROP POLICY IF EXISTS "Authenticated manage products_catalog" ON public.products_catalog;
DROP POLICY IF EXISTS "Service full access products_catalog"  ON public.products_catalog;

CREATE POLICY "Authenticated read products_catalog"
  ON public.products_catalog FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated manage products_catalog"
  ON public.products_catalog FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

CREATE POLICY "Service full access products_catalog"
  ON public.products_catalog FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE OR REPLACE FUNCTION public.tg_products_catalog_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_products_catalog_updated_at ON public.products_catalog;
CREATE TRIGGER trg_products_catalog_updated_at
  BEFORE UPDATE ON public.products_catalog
  FOR EACH ROW EXECUTE FUNCTION public.tg_products_catalog_updated_at();

-- ── Backfill a partir de funnel_products existentes ──
INSERT INTO public.products_catalog (
  product_id, platform, display_name, product_name_contains, default_role, recontact_days
)
SELECT DISTINCT ON (fp.product_id, COALESCE(fp.platform, f.platform))
  fp.product_id,
  COALESCE(fp.platform, f.platform) AS platform,
  COALESCE(fp.display_name, fp.product_name_contains) AS display_name,
  fp.product_name_contains,
  fp.role,
  fp.recontact_days
FROM public.funnel_products fp
JOIN public.funnels f ON f.id = fp.funnel_id
WHERE fp.product_id IS NOT NULL AND fp.product_id <> ''
ON CONFLICT (product_id, platform) WHERE product_id IS NOT NULL DO NOTHING;
