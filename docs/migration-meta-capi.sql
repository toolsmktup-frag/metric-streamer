-- ============================================================
-- Fase 3: Meta CAPI — Migrations necessárias
-- Execute no SQL Editor do Supabase ANTES de deployar as Edge Functions
-- ============================================================

-- 1. Adicionar colunas Meta Pixel ao lead_funnels
ALTER TABLE lead_funnels
  ADD COLUMN IF NOT EXISTS meta_pixel_id TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS meta_access_token TEXT DEFAULT NULL;

COMMENT ON COLUMN lead_funnels.meta_pixel_id IS 'Meta Pixel ID for server-side CAPI events';
COMMENT ON COLUMN lead_funnels.meta_access_token IS 'Meta Conversions API access token';

-- 2. Criar tabela de auditoria meta_capi_log
CREATE TABLE IF NOT EXISTS meta_capi_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  funnel_id UUID REFERENCES lead_funnels(id) ON DELETE SET NULL,
  event_name TEXT NOT NULL DEFAULT 'Purchase',
  event_id TEXT,
  email_hash TEXT,
  order_id TEXT,
  pixel_id TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  meta_response JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE meta_capi_log ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_meta_capi_log_funnel ON meta_capi_log(funnel_id);
CREATE INDEX IF NOT EXISTS idx_meta_capi_log_created ON meta_capi_log(created_at DESC);
