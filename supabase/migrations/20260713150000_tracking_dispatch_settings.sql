-- ─────────────────────────────────────────────────────────────────
-- Config do disparo de rastreio SAI do ENV e vira tabela (painel na
-- tela /rastreios). Antes, ligar/desligar canal, número dedicado e
-- templates exigia `supabase secrets set` + deploy — agora é um
-- Switch na tela. A edge function enqueue-tracking-dispatch lê esta
-- tabela com precedência tabela → ENV → default.
--
-- 1 linha só (id=1). enabled=false = comportamento atual: a fila
-- acumula e nada é enviado (decisão de 08/07 de segurar o disparo).
-- ─────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.tracking_dispatch_settings (
  id            int PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  enabled       boolean NOT NULL DEFAULT false,
  channel       text NOT NULL DEFAULT 'uazapi' CHECK (channel IN ('uazapi','manychat')),
  uazapi_phone  text,
  templates     jsonb NOT NULL DEFAULT '[]'::jsonb,
  batch_size    int NOT NULL DEFAULT 10 CHECK (batch_size BETWEEN 1 AND 60),
  send_delay_ms int NOT NULL DEFAULT 4000 CHECK (send_delay_ms BETWEEN 500 AND 60000),
  mc_tag_name   text,
  mc_code_field text NOT NULL DEFAULT 'codigo_rastreio',
  updated_at    timestamptz NOT NULL DEFAULT now(),
  updated_by    uuid
);

ALTER TABLE public.tracking_dispatch_settings ENABLE ROW LEVEL SECURITY;

-- Mesmo padrão do shipping_products (app interno single-org): quem é
-- autenticado lê/edita; o gate fino (só não-logística configura) fica
-- na tela, igual ao catálogo de produtos.
CREATE POLICY "Authenticated read dispatch settings"
  ON public.tracking_dispatch_settings FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated write dispatch settings"
  ON public.tracking_dispatch_settings FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Service full access dispatch settings"
  ON public.tracking_dispatch_settings FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Seed: desligado, canal uazapi travado no número dedicado 48 99211-2108,
-- templates = os 3 padrões Soulnaturi que hoje estão hardcoded na função.
INSERT INTO public.tracking_dispatch_settings (id, enabled, channel, uazapi_phone, templates)
VALUES (
  1, false, 'uazapi', '48992112108',
  jsonb_build_array(
    E'Oi {{nome}}, parabéns pela sua compra! 🌿\n\nSeu pedido da *Soulnaturi* já foi postado nos Correios e está a caminho da sua casa. 📦\n\nSeu código de rastreio é:\n*{{codigo}}*\n\nPra acompanhar a entrega, é só tocar aqui:\n{{link}}\n\nQualquer dúvida, pode chamar por aqui! 💚',
    E'Olá {{nome}}, tudo bem? 😊\n\nPassando pra te dar uma ótima notícia: seu pedido da *Soulnaturi* foi enviado e logo chega até você! 🚚\n\nCódigo de rastreio:\n*{{codigo}}*\n\nAcompanhe sua entrega por aqui:\n{{link}}\n\nObrigado pela confiança! 🌿',
    E'{{nome}}, que alegria! 🎉\n\nSeu pedido da *Soulnaturi* acabou de ser postado nos Correios. 📦\n\nAnota seu código de rastreio:\n*{{codigo}}*\n\nÉ só acompanhar a entrega aqui:\n{{link}}\n\nQualquer coisa, estamos por aqui! 💚'
  )
)
ON CONFLICT (id) DO NOTHING;
