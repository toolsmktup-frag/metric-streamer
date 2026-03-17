-- ═══════════════════════════════════════════════════════════════════
-- ETAPA 1 — FUNDAÇÃO: Organizations, Roles, Unified Customers
-- Estratégia: additive only — não remove nem altera nada existente
-- ═══════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────
-- 1. ORGANIZATIONS
-- Representa um negócio/tenant. SoulNaturi é a primeira organização.
-- ─────────────────────────────────────────────────────────────────
CREATE TABLE public.organizations (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name         text NOT NULL,
  slug         text NOT NULL UNIQUE,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;

-- Inserir SoulNaturi como organização padrão
INSERT INTO public.organizations (id, name, slug)
VALUES ('00000000-0000-0000-0000-000000000001', 'SoulNaturi', 'soulnaturi');

-- ─────────────────────────────────────────────────────────────────
-- 2. USER PROFILES (roles por organização)
-- Estende auth.users com role e organização
-- ─────────────────────────────────────────────────────────────────
CREATE TABLE public.user_profiles (
  id              uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  role            text NOT NULL DEFAULT 'admin'
                  CHECK (role IN ('admin', 'gestor', 'vendedora')),
  full_name       text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_user_profiles_org ON public.user_profiles(organization_id);
CREATE INDEX idx_user_profiles_role ON public.user_profiles(role);

ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;

-- Usuário lê apenas seu próprio perfil
CREATE POLICY "User reads own profile"
  ON public.user_profiles FOR SELECT TO authenticated
  USING (id = auth.uid());

-- Admin pode ler todos da mesma organização
CREATE POLICY "Admin reads org profiles"
  ON public.user_profiles FOR SELECT TO authenticated
  USING (
    organization_id = (
      SELECT organization_id FROM public.user_profiles WHERE id = auth.uid()
    )
    AND (
      SELECT role FROM public.user_profiles WHERE id = auth.uid()
    ) = 'admin'
  );

-- Service role tem acesso total
CREATE POLICY "Service full access profiles"
  ON public.user_profiles FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- ─────────────────────────────────────────────────────────────────
-- 3. UNIFIED CUSTOMERS
-- Um registro por cliente real, independente de quantos emails/CPFs use
-- ─────────────────────────────────────────────────────────────────
CREATE TABLE public.unified_customers (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id     uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,

  -- Identidade principal (ao menos um preenchido)
  primary_email       text,
  primary_cpf         text,   -- apenas dígitos
  primary_phone       text,   -- apenas dígitos
  full_name           text,

  -- Métricas calculadas (atualizadas via trigger)
  total_spent         numeric NOT NULL DEFAULT 0,
  total_orders        int     NOT NULL DEFAULT 0,
  first_purchase_at   timestamptz,
  last_purchase_at    timestamptz,

  -- Controle de qualidade da identidade
  identity_confidence text NOT NULL DEFAULT 'high'
                      CHECK (identity_confidence IN ('high', 'medium', 'low')),
  needs_review        boolean NOT NULL DEFAULT false,
  review_reason       text,

  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_unified_customers_org      ON public.unified_customers(organization_id);
CREATE INDEX idx_unified_customers_email    ON public.unified_customers(primary_email);
CREATE INDEX idx_unified_customers_cpf      ON public.unified_customers(primary_cpf);
CREATE INDEX idx_unified_customers_phone    ON public.unified_customers(primary_phone);
CREATE INDEX idx_unified_customers_review   ON public.unified_customers(needs_review) WHERE needs_review = true;

ALTER TABLE public.unified_customers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated read customers"
  ON public.unified_customers FOR SELECT TO authenticated USING (true);

CREATE POLICY "Service full access customers"
  ON public.unified_customers FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- ─────────────────────────────────────────────────────────────────
-- 4. CUSTOMER IDENTITY LINKS
-- Mapeia todos os identificadores conhecidos de um cliente
-- (email, CPF, telefone) → unified_customer
-- Permite encontrar o cliente mesmo com email diferente
-- ─────────────────────────────────────────────────────────────────
CREATE TABLE public.customer_identity_links (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  unified_customer_id  uuid NOT NULL REFERENCES public.unified_customers(id) ON DELETE CASCADE,
  organization_id      uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,

  identifier_type      text NOT NULL CHECK (identifier_type IN ('email', 'cpf', 'phone', 'name')),
  identifier_value     text NOT NULL,
  confidence           text NOT NULL DEFAULT 'high'
                       CHECK (confidence IN ('high', 'medium', 'low')),

  created_at           timestamptz NOT NULL DEFAULT now(),

  UNIQUE (organization_id, identifier_type, identifier_value)
);

CREATE INDEX idx_identity_links_customer ON public.customer_identity_links(unified_customer_id);
CREATE INDEX idx_identity_links_lookup   ON public.customer_identity_links(organization_id, identifier_type, identifier_value);

ALTER TABLE public.customer_identity_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated read identity_links"
  ON public.customer_identity_links FOR SELECT TO authenticated USING (true);

CREATE POLICY "Service full access identity_links"
  ON public.customer_identity_links FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- ─────────────────────────────────────────────────────────────────
-- 5. CUSTOMER PURCHASES
-- Todas as compras de todas as plataformas, normalizadas
-- Substitui a visão fragmentada por plataforma
-- ─────────────────────────────────────────────────────────────────
CREATE TABLE public.customer_purchases (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id       uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  unified_customer_id   uuid REFERENCES public.unified_customers(id) ON DELETE SET NULL,

  -- Plataforma de origem
  platform              text NOT NULL CHECK (platform IN ('ticto', 'guru', 'kiwify', 'hotmart', 'eduzz', 'manual', 'outro')),
  platform_transaction_id text,           -- ID original na plataforma
  platform_order_id     text,

  -- Produto
  product_name          text NOT NULL,
  product_id            text,
  offer_name            text,
  offer_id              text,
  product_type          text DEFAULT 'digital' CHECK (product_type IN ('digital', 'fisico', 'assinatura')),

  -- Financeiro (em reais)
  gross_amount          numeric NOT NULL DEFAULT 0,
  net_amount            numeric,
  payment_method        text,
  installments          int DEFAULT 1,
  status                text NOT NULL DEFAULT 'authorized',

  -- Data real da compra
  purchased_at          timestamptz NOT NULL,

  -- Atribuição de tráfego
  utm_source            text,
  utm_medium            text,
  utm_campaign          text,
  utm_content           text,
  utm_term              text,
  meta_campaign_id      text,
  meta_adset_id         text,
  meta_ad_id            text,

  -- Dados brutos para debug/auditoria
  raw_data              jsonb,

  -- Controle
  imported_from         text,   -- 'webhook', 'planilha', 'api'
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),

  UNIQUE (platform, platform_transaction_id)
);

CREATE INDEX idx_purchases_org        ON public.customer_purchases(organization_id);
CREATE INDEX idx_purchases_customer   ON public.customer_purchases(unified_customer_id);
CREATE INDEX idx_purchases_platform   ON public.customer_purchases(platform);
CREATE INDEX idx_purchases_date       ON public.customer_purchases(purchased_at);
CREATE INDEX idx_purchases_product    ON public.customer_purchases(product_name);
CREATE INDEX idx_purchases_status     ON public.customer_purchases(status);
CREATE INDEX idx_purchases_meta_camp  ON public.customer_purchases(meta_campaign_id);

ALTER TABLE public.customer_purchases ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated read purchases"
  ON public.customer_purchases FOR SELECT TO authenticated USING (true);

CREATE POLICY "Service full access purchases"
  ON public.customer_purchases FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- ─────────────────────────────────────────────────────────────────
-- 6. SPREADSHEET IMPORT LOG
-- Rastreia uploads de planilhas históricas
-- ─────────────────────────────────────────────────────────────────
CREATE TABLE public.import_logs (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id),
  platform        text NOT NULL,
  file_name       text,
  total_rows      int DEFAULT 0,
  imported_rows   int DEFAULT 0,
  skipped_rows    int DEFAULT 0,
  error_rows      int DEFAULT 0,
  status          text NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  error_detail    text,
  started_at      timestamptz DEFAULT now(),
  finished_at     timestamptz,
  created_by      uuid REFERENCES auth.users(id)
);

ALTER TABLE public.import_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated read import_logs"
  ON public.import_logs FOR SELECT TO authenticated USING (true);

CREATE POLICY "Service full access import_logs"
  ON public.import_logs FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- ─────────────────────────────────────────────────────────────────
-- 7. ADICIONAR organization_id NAS TABELAS EXISTENTES (nullable)
-- NÃO quebra nada. Dado default = organização SoulNaturi.
-- ─────────────────────────────────────────────────────────────────
ALTER TABLE public.meta_campaigns
  ADD COLUMN IF NOT EXISTS organization_id uuid
  REFERENCES public.organizations(id)
  DEFAULT '00000000-0000-0000-0000-000000000001';

ALTER TABLE public.meta_adsets
  ADD COLUMN IF NOT EXISTS organization_id uuid
  REFERENCES public.organizations(id)
  DEFAULT '00000000-0000-0000-0000-000000000001';

ALTER TABLE public.meta_ads
  ADD COLUMN IF NOT EXISTS organization_id uuid
  REFERENCES public.organizations(id)
  DEFAULT '00000000-0000-0000-0000-000000000001';

ALTER TABLE public.meta_insights
  ADD COLUMN IF NOT EXISTS organization_id uuid
  REFERENCES public.organizations(id)
  DEFAULT '00000000-0000-0000-0000-000000000001';

ALTER TABLE public.ticto_transactions
  ADD COLUMN IF NOT EXISTS organization_id uuid
  REFERENCES public.organizations(id)
  DEFAULT '00000000-0000-0000-0000-000000000001';

-- Atualiza registros existentes com a org padrão
UPDATE public.meta_campaigns    SET organization_id = '00000000-0000-0000-0000-000000000001' WHERE organization_id IS NULL;
UPDATE public.meta_adsets       SET organization_id = '00000000-0000-0000-0000-000000000001' WHERE organization_id IS NULL;
UPDATE public.meta_ads          SET organization_id = '00000000-0000-0000-0000-000000000001' WHERE organization_id IS NULL;
UPDATE public.meta_insights     SET organization_id = '00000000-0000-0000-0000-000000000001' WHERE organization_id IS NULL;
UPDATE public.ticto_transactions SET organization_id = '00000000-0000-0000-0000-000000000001' WHERE organization_id IS NULL;

-- ─────────────────────────────────────────────────────────────────
-- 8. FUNÇÃO: resolve_or_create_customer
-- Motor de cruzamento de identidade
-- Busca cliente por CPF (alta confiança) → email (alta) → telefone (média) → nome (baixa)
-- Se não encontra, cria novo. Se encontra com média/baixa confiança, marca para revisão.
-- ─────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.resolve_or_create_customer(
  p_org_id    uuid,
  p_email     text DEFAULT NULL,
  p_cpf       text DEFAULT NULL,
  p_phone     text DEFAULT NULL,
  p_name      text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_customer_id uuid;
  v_confidence  text;
  v_cpf_clean   text;
  v_phone_clean text;
BEGIN
  -- Normaliza CPF e telefone (só dígitos)
  v_cpf_clean   := regexp_replace(COALESCE(p_cpf, ''), '[^0-9]', '', 'g');
  v_phone_clean := regexp_replace(COALESCE(p_phone, ''), '[^0-9]', '', 'g');

  IF length(v_cpf_clean) < 11 THEN v_cpf_clean := NULL; END IF;
  IF length(v_phone_clean) < 10 THEN v_phone_clean := NULL; END IF;

  -- 1. Busca por CPF (confiança alta)
  IF v_cpf_clean IS NOT NULL THEN
    SELECT unified_customer_id INTO v_customer_id
    FROM public.customer_identity_links
    WHERE organization_id = p_org_id
      AND identifier_type = 'cpf'
      AND identifier_value = v_cpf_clean
    LIMIT 1;
    IF v_customer_id IS NOT NULL THEN
      v_confidence := 'high';
    END IF;
  END IF;

  -- 2. Busca por email (confiança alta)
  IF v_customer_id IS NULL AND p_email IS NOT NULL AND p_email != '' THEN
    SELECT unified_customer_id INTO v_customer_id
    FROM public.customer_identity_links
    WHERE organization_id = p_org_id
      AND identifier_type = 'email'
      AND identifier_value = lower(trim(p_email))
    LIMIT 1;
    IF v_customer_id IS NOT NULL THEN
      v_confidence := 'high';
    END IF;
  END IF;

  -- 3. Busca por telefone (confiança média)
  IF v_customer_id IS NULL AND v_phone_clean IS NOT NULL THEN
    SELECT unified_customer_id INTO v_customer_id
    FROM public.customer_identity_links
    WHERE organization_id = p_org_id
      AND identifier_type = 'phone'
      AND identifier_value = v_phone_clean
    LIMIT 1;
    IF v_customer_id IS NOT NULL THEN
      v_confidence := 'medium';
    END IF;
  END IF;

  -- 4. Se não encontrou nada → cria novo cliente
  IF v_customer_id IS NULL THEN
    INSERT INTO public.unified_customers (
      organization_id, primary_email, primary_cpf, primary_phone, full_name,
      identity_confidence
    ) VALUES (
      p_org_id,
      CASE WHEN p_email != '' THEN lower(trim(p_email)) ELSE NULL END,
      v_cpf_clean,
      v_phone_clean,
      p_name,
      'high'
    )
    RETURNING id INTO v_customer_id;
    v_confidence := 'high';
  END IF;

  -- 5. Registra/atualiza os identity links
  IF v_cpf_clean IS NOT NULL THEN
    INSERT INTO public.customer_identity_links (unified_customer_id, organization_id, identifier_type, identifier_value, confidence)
    VALUES (v_customer_id, p_org_id, 'cpf', v_cpf_clean, 'high')
    ON CONFLICT (organization_id, identifier_type, identifier_value) DO NOTHING;
  END IF;

  IF p_email IS NOT NULL AND p_email != '' THEN
    INSERT INTO public.customer_identity_links (unified_customer_id, organization_id, identifier_type, identifier_value, confidence)
    VALUES (v_customer_id, p_org_id, 'email', lower(trim(p_email)), 'high')
    ON CONFLICT (organization_id, identifier_type, identifier_value) DO NOTHING;
  END IF;

  IF v_phone_clean IS NOT NULL THEN
    INSERT INTO public.customer_identity_links (unified_customer_id, organization_id, identifier_type, identifier_value, confidence)
    VALUES (v_customer_id, p_org_id, 'phone', v_phone_clean, 'medium')
    ON CONFLICT (organization_id, identifier_type, identifier_value) DO NOTHING;
  END IF;

  -- 6. Se confiança média, marca para revisão
  IF v_confidence = 'medium' THEN
    UPDATE public.unified_customers
    SET needs_review = true,
        review_reason = 'Matched by phone only — confirm identity',
        identity_confidence = 'medium'
    WHERE id = v_customer_id;
  END IF;

  RETURN v_customer_id;
END;
$$;

-- ─────────────────────────────────────────────────────────────────
-- 9. TRIGGER: atualiza métricas do cliente após nova compra
-- ─────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.update_customer_metrics()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF NEW.unified_customer_id IS NOT NULL AND NEW.status = 'authorized' THEN
    UPDATE public.unified_customers
    SET
      total_spent       = (SELECT COALESCE(SUM(gross_amount), 0) FROM public.customer_purchases WHERE unified_customer_id = NEW.unified_customer_id AND status = 'authorized'),
      total_orders      = (SELECT COUNT(*) FROM public.customer_purchases WHERE unified_customer_id = NEW.unified_customer_id AND status = 'authorized'),
      first_purchase_at = (SELECT MIN(purchased_at) FROM public.customer_purchases WHERE unified_customer_id = NEW.unified_customer_id AND status = 'authorized'),
      last_purchase_at  = (SELECT MAX(purchased_at) FROM public.customer_purchases WHERE unified_customer_id = NEW.unified_customer_id AND status = 'authorized'),
      updated_at        = now()
    WHERE id = NEW.unified_customer_id;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_update_customer_metrics
  AFTER INSERT OR UPDATE ON public.customer_purchases
  FOR EACH ROW EXECUTE FUNCTION public.update_customer_metrics();
