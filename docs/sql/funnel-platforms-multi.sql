-- =============================================================
-- Multi-plataforma por funil
-- Rode este script no Supabase SQL Editor (uma vez)
-- =============================================================

-- 1. Tabela de plataformas por funil (1-N)
CREATE TABLE IF NOT EXISTS public.funnel_platforms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  funnel_id uuid NOT NULL REFERENCES public.funnels(id) ON DELETE CASCADE,
  platform text NOT NULL CHECK (platform IN ('ticto','guru','kiwify','hotmart','eduzz','outro')),
  webhook_token text NOT NULL UNIQUE DEFAULT gen_random_uuid()::text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(funnel_id, platform)
);

ALTER TABLE public.funnel_platforms ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "view funnel_platforms" ON public.funnel_platforms;
CREATE POLICY "view funnel_platforms" ON public.funnel_platforms
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "manage funnel_platforms" ON public.funnel_platforms;
CREATE POLICY "manage funnel_platforms" ON public.funnel_platforms
  FOR ALL TO authenticated
  USING (public.get_user_role() IN ('admin','gestor'))
  WITH CHECK (public.get_user_role() IN ('admin','gestor'));

CREATE INDEX IF NOT EXISTS idx_funnel_platforms_token ON public.funnel_platforms(webhook_token);
CREATE INDEX IF NOT EXISTS idx_funnel_platforms_funnel ON public.funnel_platforms(funnel_id);

-- 2. Backfill: cada funil existente vira uma linha em funnel_platforms
--    preservando o token atual (zero breaking change nos webhooks já cadastrados)
INSERT INTO public.funnel_platforms (funnel_id, platform, webhook_token)
SELECT id, platform, webhook_token FROM public.funnels
ON CONFLICT (funnel_id, platform) DO NOTHING;

-- 3. Coluna platform opcional em funnel_products
--    NULL = aplica a todas as plataformas (comportamento atual)
--    'ticto' / 'guru' / etc = ID específico daquela plataforma
ALTER TABLE public.funnel_products
  ADD COLUMN IF NOT EXISTS platform text
  CHECK (platform IS NULL OR platform IN ('ticto','guru','kiwify','hotmart','eduzz','outro'));

CREATE INDEX IF NOT EXISTS idx_funnel_products_platform
  ON public.funnel_products(funnel_id, platform);

-- =============================================================
-- Validação: deve retornar uma linha por funil existente
-- =============================================================
-- SELECT f.name, fp.platform, fp.webhook_token
-- FROM public.funnels f
-- JOIN public.funnel_platforms fp ON fp.funnel_id = f.id
-- ORDER BY f.name;
