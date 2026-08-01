-- ─────────────────────────────────────────────────────────────────
-- Mensagem de rastreio por marca: até aqui o texto de WhatsApp era
-- único e global, citando "Soulnaturi" fixo pra qualquer produto
-- físico. Com a entrada do Glicosoul (marca "GlicaSoul") isso ficou
-- errado — cliente recebe mensagem citando a marca errada.
--
-- Solução: reusar shipping_products.display_name (já existente) como
-- fonte da marca no template ({{produto}}), em vez de criar tabela
-- nova. get_shipping_display_name() acha o display_name pelo mesmo
-- match de is_shipping_product(); a edge function chama via RPC.
--
-- Desambiguação: o catálogo tem um padrão guarda-chuva 'soulnaturi'
-- (marca da empresa) que bate em quase todo nome de produto junto
-- com a sub-marca real (ex: "1 pote SuperVITA - Soulnaturi" bate em
-- 'supervita' E em 'soulnaturi'). Comprimento de string não separa
-- os dois de forma confiável — coluna `priority` explícita resolve:
-- sub-marca (priority=1) sempre vence sobre o guarda-chuva (default 0).
-- ─────────────────────────────────────────────────────────────────

ALTER TABLE public.shipping_products ADD COLUMN IF NOT EXISTS priority smallint NOT NULL DEFAULT 0;

-- Cadastra Glicosoul no catálogo (redundância: já entra hoje via
-- product_type='fisico', mas garante mesmo se a classificação mudar).
INSERT INTO public.shipping_products (product_name_contains, display_name, priority) VALUES
  ('glicosoul', 'GlicaSoul', 1)
ON CONFLICT (product_name_contains) DO NOTHING;

-- Display names "prontos pra frase" + prioridade sobre o guarda-chuva
-- 'soulnaturi' (removendo o "(potes)"/"(físico)" que ficava estranho
-- em "Seu pedido de *ArticulaBEM (potes)* foi postado...").
UPDATE public.shipping_products SET display_name = 'ArticulaBEM', priority = 1 WHERE product_name_contains = 'articulabem';
UPDATE public.shipping_products SET display_name = 'SuperVITA', priority = 1 WHERE product_name_contains = 'supervita';
UPDATE public.shipping_products SET display_name = 'RevitaSoul', priority = 1 WHERE product_name_contains = 'revitasoul';
UPDATE public.shipping_products SET display_name = 'Necessaire', priority = 1 WHERE product_name_contains = 'necessaire';
UPDATE public.shipping_products SET display_name = 'Ecobag', priority = 1 WHERE product_name_contains = 'ecobag';
UPDATE public.shipping_products SET display_name = 'Revolução do Ser', priority = 1 WHERE product_name_contains = 'revolução do ser';

CREATE OR REPLACE FUNCTION public.get_shipping_display_name(p_name text)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT sp.display_name
  FROM public.shipping_products sp
  WHERE sp.active
    AND COALESCE(p_name, '') ILIKE '%' || sp.product_name_contains || '%'
  ORDER BY sp.priority DESC, length(sp.product_name_contains) DESC
  LIMIT 1;
$$;

-- Templates salvos na tela /rastreios → painel "Disparo": troca a
-- marca fixa "Soulnaturi" pelo placeholder {{produto}}, já suportado
-- pela edge function mas nunca usado nos textos reais até agora.
UPDATE public.tracking_dispatch_settings
SET templates = '[
  "Oi {{nome}}, parabéns pela sua compra! 🌿\n\nSeu pedido da *{{produto}}* já foi postado nos Correios e está a caminho da sua casa. 📦\n\nSeu código de rastreio é:\n*{{codigo}}*\n\nPra acompanhar a entrega, é só tocar aqui:\n{{link}}\n\nQualquer dúvida, pode chamar por aqui! 💚",
  "Olá {{nome}}, tudo bem? 😊\n\nPassando pra te dar uma ótima notícia: seu pedido da *{{produto}}* foi enviado e logo chega até você! 🚚\n\nCódigo de rastreio:\n*{{codigo}}*\n\nAcompanhe sua entrega por aqui:\n{{link}}\n\nObrigado pela confiança! 🌿",
  "{{nome}}, que alegria! 🎉\n\nSeu pedido da *{{produto}}* acabou de ser postado nos Correios. 📦\n\nAnota seu código de rastreio:\n*{{codigo}}*\n\nÉ só acompanhar a entrega aqui:\n{{link}}\n\nQualquer coisa, estamos por aqui! 💚"
]'::jsonb
WHERE id = 1;
