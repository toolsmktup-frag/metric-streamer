
## Plano: Multi-plataforma por funil

### Auditoria rápida
- `funnels.platform` hoje é string única (ticto/guru/kiwify/hotmart/eduzz/outro) + 1 `webhook_token`.
- Webhooks (ticto/guru/eduzz) fazem lookup de funil por `webhook_token` na tabela `funnels`.
- `funnel_products` classifica front/bump/upsell por `product_id` ou `product_name_contains` — sem distinção de plataforma.
- Análises (CRM Analytics, resumo, campanhas) já agregam por `funnel_id`. Se webhook resolver o `funnel_id` certo, tudo une automaticamente.

### Decisão arquitetural
**Tabela 1-N `funnel_platforms`** (mais escalável, isola tokens, evita bug):
- Cada plataforma tem seu próprio `webhook_token` único → permite revogar/regenerar isolado.
- Mantém `funnels.platform` como "plataforma primária" (legacy + default), sem breaking change.
- Coluna `platform` opcional em `funnel_products` → NULL = vale pra todas; preenchida = específica daquela plataforma (resolve IDs diferentes Guru vs Ticto).

### Passo a passo

**Passo 1 — SQL (você roda no Supabase SQL Editor)**
```sql
-- 1. Tabela de plataformas por funil
CREATE TABLE IF NOT EXISTS public.funnel_platforms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  funnel_id uuid NOT NULL REFERENCES public.funnels(id) ON DELETE CASCADE,
  platform text NOT NULL CHECK (platform IN ('ticto','guru','kiwify','hotmart','eduzz','outro')),
  webhook_token text NOT NULL UNIQUE DEFAULT gen_random_uuid()::text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(funnel_id, platform)
);

ALTER TABLE public.funnel_platforms ENABLE ROW LEVEL SECURITY;

CREATE POLICY "view funnel_platforms" ON public.funnel_platforms
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "manage funnel_platforms" ON public.funnel_platforms
  FOR ALL TO authenticated
  USING (public.get_user_role() IN ('admin','gestor'))
  WITH CHECK (public.get_user_role() IN ('admin','gestor'));

CREATE INDEX idx_funnel_platforms_token ON public.funnel_platforms(webhook_token);
CREATE INDEX idx_funnel_platforms_funnel ON public.funnel_platforms(funnel_id);

-- 2. Backfill: cada funnel atual vira 1 funnel_platforms com seu token
INSERT INTO public.funnel_platforms (funnel_id, platform, webhook_token)
SELECT id, platform, webhook_token FROM public.funnels
ON CONFLICT (funnel_id, platform) DO NOTHING;

-- 3. Coluna platform opcional em funnel_products
ALTER TABLE public.funnel_products
  ADD COLUMN IF NOT EXISTS platform text
  CHECK (platform IS NULL OR platform IN ('ticto','guru','kiwify','hotmart','eduzz','outro'));

CREATE INDEX IF NOT EXISTS idx_funnel_products_platform
  ON public.funnel_products(funnel_id, platform);
```

**Passo 2 — Edge functions (eu altero)**
- `ticto-webhook`, `guru-webhook`, `eduzz-webhook`: mudar lookup de funil — primeiro tenta `funnel_platforms.webhook_token`, fallback no `funnels.webhook_token` (compat).
- Resolução de produto: filtrar `funnel_products` por (`funnel_id` AND (`platform = X` OR `platform IS NULL`)).

**Passo 3 — UI `FunisConfigurar.tsx` (eu altero)**
- Seção "Plataformas conectadas": lista de `funnel_platforms` com botão "+ Adicionar plataforma".
- Cada item mostra: select de plataforma, webhook URL gerada, botão regenerar token, botão remover.
- Editor de produtos ganha seletor "Aplica a: Todas / Guru / Ticto / ..." por linha.

**Passo 4 — Hooks (eu altero)**
- `useFunnels.ts`: incluir `funnel_platforms(*)` no select.
- Novos hooks: `useUpsertFunnelPlatform`, `useDeleteFunnelPlatform`.

### Validação
1. Rodar SQL → conferir que cada funil existente tem 1 linha em `funnel_platforms` com mesmo token (nada quebra).
2. Em `/funis/articulabem-1/configurar` → adicionar Ticto → copiar nova webhook URL → cadastrar na Ticto.
3. Disparar venda teste Ticto → ver aparecendo no Resumo, KPIs e CRM Analytics do mesmo funil junto com vendas Guru.
4. Cadastrar produto Ticto com ID diferente do Guru → confirmar que classificação front/bump/upsell respeita.

### Compatibilidade
- `funnels.platform` e `funnels.webhook_token` ficam intactos (legacy fallback). Zero breaking change em webhooks já configurados.
