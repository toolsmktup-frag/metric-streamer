-- ────────────────────────────────────────────────────────────────────
-- Catálogo de produtos com nomes canônicos e aliases
-- Resolve fragmentação de nomes entre plataformas (Ticto, Guru, Eduzz)
-- ────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS product_catalog (
  canonical_name text PRIMARY KEY,
  category       text NOT NULL, -- front_digital, upsell_digital, fisico, assinatura, combo, evento, desenvolvimento
  sort_order     int DEFAULT 99
);

CREATE TABLE IF NOT EXISTS product_name_aliases (
  alias          text PRIMARY KEY,
  canonical_name text NOT NULL REFERENCES product_catalog(canonical_name) ON DELETE CASCADE
);

-- ── Produtos canônicos ──
INSERT INTO product_catalog (canonical_name, category, sort_order) VALUES
  ('Guia de Tinturas',                    'front_digital',   1),
  ('Manual das Ervas para Dores',         'front_digital',   2),
  ('Chás Originais',                      'front_digital',   3),
  ('Workshop Oficina das Ervas',          'upsell_digital',  4),
  ('Receitas de Xaropes Ancestrais',      'upsell_digital',  5),
  ('Curso Mestre das Tinturas',           'upsell_digital',  6),
  ('Mestre em Méis Medicinais',           'upsell_digital',  7),
  ('Curso dos Erveiros',                  'upsell_digital',  8),
  ('Programa Diabetes Sem Segredos',      'upsell_digital',  9),
  ('Revistas do Erveiro',                 'assinatura',     10),
  ('Articulabem',                         'fisico',         11),
  ('SuperVITA',                           'fisico',         12),
  ('Combo Mestre (Tinturas + Méis)',      'combo',          13),
  ('Super Combo Erveiro Master',          'combo',          14),
  ('Limpeza Energética com as Ervas',     'desenvolvimento', 15),
  ('Alinhamento com Ervas',              'desenvolvimento', 16),
  ('Despertar da Vida Plena',             'desenvolvimento', 17),
  ('Revolução do Ser',                    'desenvolvimento', 18),
  ('Clube Secreto das Plantas',           'desenvolvimento', 19),
  ('Portal Fluxo do Ser',                 'assinatura',     20)
ON CONFLICT (canonical_name) DO NOTHING;

-- ── Aliases ──
INSERT INTO product_name_aliases (alias, canonical_name) VALUES
  -- Guia de Tinturas
  ('Como preparar tinturas de ervas medicinais',                                                                                                                                                          'Guia de Tinturas'),
  ('COMO PREPARAR TINTURAS DE ERVAS MEDICINAIS',                                                                                                                                                         'Guia de Tinturas'),
  ('Guia de Preparo de Tinturas de Ervas Medicinais',                                                                                                                                                    'Guia de Tinturas'),
  ('Como preparar tinturas de ervas',                                                                                                                                                                     'Guia de Tinturas'),
  ('VOCÊ GANHOU UM DESCONTO DE 10% NO GUIA DE TINTURAS! Válido para as próximas 5 pessoas...',                                                                                                           'Guia de Tinturas'),
  ('Aprenda de forma rápida e fácil com vídeo-aulas: o eBook ensina o passo a passo escrito, mas com o Curso Mestre das Tinturas você vê tudo sendo feito em vídeo, sem dúvidas ou confusão!',           'Curso Mestre das Tinturas'),

  -- Curso Mestre das Tinturas
  ('Curso Mestre das Tinturas',                                                                                                                                                                           'Curso Mestre das Tinturas'),
  ('CURSO MESTRE DAS TINTURAS',                                                                                                                                                                          'Curso Mestre das Tinturas'),
  ('Mestre das Tinturas - Curso online',                                                                                                                                                                  'Curso Mestre das Tinturas'),
  ('PROMOÇÃO RELÂMPAGO: Aprenda de forma rápida e fácil em vídeo-aulas, com o Curso Mestre das Tinturas!',                                                                                               'Curso Mestre das Tinturas'),
  ('Caderno de Fórmulas das Tinturas Ancestrais - Melhores combinações de plantas e formas de uso + Workshop Oficina das Ervas',                                                                          'Curso Mestre das Tinturas'),

  -- Curso dos Erveiros
  ('Curso dos Erveiros',                                                                                                                                                                                  'Curso dos Erveiros'),
  ('Curso dos Erveiros - SUPER DESCONTO',                                                                                                                                                                 'Curso dos Erveiros'),
  ('Curso dos Erveiros 2',                                                                                                                                                                                'Curso dos Erveiros'),
  ('Acesso Estendido ao Curso dos Erveiros',                                                                                                                                                              'Curso dos Erveiros'),

  -- Manual das Ervas para Dores
  ('Manual das Ervas para Dores',                                                                                                                                                                         'Manual das Ervas para Dores'),
  ('MANUAL DAS ERVAS PARA TRATAR DORES',                                                                                                                                                                 'Manual das Ervas para Dores'),
  ('Como acabar com a causa das dores com plantas medicinais.',                                                                                                                                           'Manual das Ervas para Dores'),

  -- Chás Originais
  ('O Poder Medicinal dos Chás Originais',                                                                                                                                                                'Chás Originais'),
  ('O guia de preparo dos chás que curam - Aprenda a potencializar seus chás e extrair ao máximo os benefícios das plantas',                                                                              'Chás Originais'),
  ('Guia de Preparo dos Chás Originais',                                                                                                                                                                  'Chás Originais'),
  ('APRENDA A FAZER CHÁS QUE CURAM - Ative o todo o poder medicinal das plantas!',                                                                                                                        'Chás Originais'),

  -- Workshop Oficina das Ervas
  ('Adquira junto: WORKSHOP OFICINA DAS ERVAS - Conheça o poder das ervas medicinais e aprenda a fazer diversos remédios caseiros!',                                                                      'Workshop Oficina das Ervas'),
  ('PARTICIPE DO WORKSHOP OFICINA DAS ERVAS: DIA 11/05 ÀS 14H - Conheça o poder das ervas e aprenda a fazer diversos remédios caseiros! Evento Online e ao vivo',                                        'Workshop Oficina das Ervas'),
  ('OFICINA DAS ERVAS - WORKSHOP COM MATHEUS COLOMBO',                                                                                                                                                   'Workshop Oficina das Ervas'),
  ('Gravação Oficina das Ervas',                                                                                                                                                                          'Workshop Oficina das Ervas'),
  ('WORKSHOP OFICINA DAS ERVAS - Conheça o poder das ervas medicinais e aprenda a fazer diversos remédios caseiros!',                                                                                     'Workshop Oficina das Ervas'),

  -- Mestre em Méis Medicinais
  ('CURSO - MESTRE EM MÉIS MEDICINAIS',                                                                                                                                                                  'Mestre em Méis Medicinais'),
  ('Curso Mestre em Méis Medicinais',                                                                                                                                                                     'Mestre em Méis Medicinais'),
  ('Curso Mestre em Méis Medicinais - Original',                                                                                                                                                          'Mestre em Méis Medicinais'),

  -- Receitas de Xaropes Ancestrais
  ('Receitas de Xaropes Ancestrais: Como usar suas tinturas para criar 11 xaropes medicinais poderosos',                                                                                                  'Receitas de Xaropes Ancestrais'),

  -- Programa Diabetes Sem Segredos
  ('Programa Diabetes Sem Segredos',                                                                                                                                                                      'Programa Diabetes Sem Segredos'),
  ('Programa Diabetes Sem Segredos - Online',                                                                                                                                                             'Programa Diabetes Sem Segredos'),

  -- Revistas do Erveiro
  ('Apostilas do Erveiro - Anual',                                                                                                                                                                        'Revistas do Erveiro'),
  ('Revistas do Erveiro - Anual',                                                                                                                                                                         'Revistas do Erveiro'),
  ('REVISTAS DO ERVEIRO - ANUAL',                                                                                                                                                                         'Revistas do Erveiro'),
  ('Revistas do Erveiro - Anual - 247',                                                                                                                                                                   'Revistas do Erveiro'),
  ('Apostilas do Erveiro - mensal',                                                                                                                                                                       'Revistas do Erveiro'),
  ('Revistas do Erveiro - mensal',                                                                                                                                                                        'Revistas do Erveiro'),
  ('REVISTAS DO ERVEIRO - MENSAL',                                                                                                                                                                        'Revistas do Erveiro'),
  ('Apostilas do Erveiro - oferta especial',                                                                                                                                                              'Revistas do Erveiro'),
  ('Apostilas do Erveiro',                                                                                                                                                                                'Revistas do Erveiro'),
  ('Caminho das Plantas Medicinais - Novas apostilas todos os meses!',                                                                                                                                    'Revistas do Erveiro'),
  ('Revistas Plantas e Saúde',                                                                                                                                                                            'Revistas do Erveiro'),

  -- Articulabem
  ('1 pote ArticulaBEM - Soulnaturi',                                                                                                                                                                     'Articulabem'),
  ('3 potes ArticulaBEM - Soulnaturi',                                                                                                                                                                    'Articulabem'),
  ('6 potes ArticulaBEM - Soulnaturi',                                                                                                                                                                    'Articulabem'),
  ('12 potes ArticulaBEM - Soulnaturi',                                                                                                                                                                   'Articulabem'),
  ('Pote Grátis ArticulaBEM - Soulnaturi',                                                                                                                                                               'Articulabem'),
  ('Upsell 1 - 3 potes ArticulaBEM - Soulnaturi',                                                                                                                                                        'Articulabem'),
  ('Pote Extra ArticulaBEM - Soulnaturi (Bump do pote grátis)',                                                                                                                                           'Articulabem'),
  ('3 Potes Articulabem',                                                                                                                                                                                 'Articulabem'),
  ('1 pote ArticulaBEM - Soulnaturi - R$149,00',                                                                                                                                                         'Articulabem'),

  -- SuperVITA
  ('1 pote SuperVITA - Soulnaturi - R$147,00',                                                                                                                                                           'SuperVITA'),
  ('3 potes SuperVITA - Soulnaturi',                                                                                                                                                                      'SuperVITA'),
  ('5 potes SuperVITA - Soulnaturi  R$499,00',                                                                                                                                                           'SuperVITA'),
  ('2 potes SuperVITA - Soulnaturi',                                                                                                                                                                      'SuperVITA'),

  -- Combo Mestre
  ('COMBO MESTRE: Mestre das Tinturas + Mestre em Méis Medicinais',                                                                                                                                      'Combo Mestre (Tinturas + Méis)'),

  -- Super Combo Erveiro Master
  ('SUPER COMBO - Erveiro Master - VITALÍCIO',                                                                                                                                                            'Super Combo Erveiro Master'),
  ('SUPER COMBO - Erveiro Master - 5 anos',                                                                                                                                                              'Super Combo Erveiro Master'),
  ('COMBO DOS ERVEIROS - 5 anos',                                                                                                                                                                        'Super Combo Erveiro Master'),

  -- Limpeza Energética
  ('Limpeza Energética com as Ervas Sagradas',                                                                                                                                                            'Limpeza Energética com as Ervas'),

  -- Alinhamento com Ervas
  ('Alinhamento com Ervas',                                                                                                                                                                               'Alinhamento com Ervas'),
  ('Renovação Alinhamento com Ervas',                                                                                                                                                                     'Alinhamento com Ervas'),
  ('Renovação do curso Alinhamento com Ervas',                                                                                                                                                            'Alinhamento com Ervas'),

  -- Despertar da Vida Plena
  ('Despertar da Vida Plena',                                                                                                                                                                             'Despertar da Vida Plena'),

  -- Revolução do Ser
  ('Revolução do Ser',                                                                                                                                                                                    'Revolução do Ser'),

  -- Clube Secreto das Plantas
  ('Clube Secreto das Plantas',                                                                                                                                                                           'Clube Secreto das Plantas'),

  -- Portal Fluxo do Ser
  ('Portal Fluxo do Ser',                                                                                                                                                                                 'Portal Fluxo do Ser'),
  ('Fluxo do Ser',                                                                                                                                                                                        'Portal Fluxo do Ser'),
  ('Portal Fluxo do Ser - 3 meses gratuitos!',                                                                                                                                                           'Portal Fluxo do Ser'),
  ('Portal Fluxo do Ser - Apenas R$4,90 no primeiro mês!',                                                                                                                                               'Portal Fluxo do Ser'),
  ('A Trilha do Despertar - Mensal',                                                                                                                                                                      'Portal Fluxo do Ser'),
  ('A Trilha do Despertar',                                                                                                                                                                               'Portal Fluxo do Ser'),
  ('A Trilha do Despertar - Anual',                                                                                                                                                                       'Portal Fluxo do Ser'),
  ('Clube Soul Nature - Anual',                                                                                                                                                                           'Portal Fluxo do Ser')

ON CONFLICT (alias) DO NOTHING;

-- ── Função auxiliar: normaliza nome do produto para nome canônico ──
CREATE OR REPLACE FUNCTION fn_normalize_product(product_name text)
RETURNS text
LANGUAGE sql
STABLE
AS $$
  SELECT COALESCE(
    (SELECT canonical_name FROM product_name_aliases WHERE alias = product_name),
    product_name  -- mantém o nome original se não tiver alias
  );
$$;

-- ── Atualiza fn_crosssell_matrix para usar nomes canônicos ──
CREATE OR REPLACE FUNCTION fn_crosssell_matrix()
RETURNS TABLE(
  product_a       text,
  product_b       text,
  buyers_both     bigint,
  buyers_of_a     bigint,
  cross_sell_pct  numeric
)
LANGUAGE sql
STABLE
AS $$
  WITH all_purchases AS (
    -- Guru + Eduzz
    SELECT
      unified_customer_id::text AS customer_id,
      fn_normalize_product(product_name) AS product_name
    FROM customer_purchases
    WHERE status = 'authorized'
      AND unified_customer_id IS NOT NULL
      AND product_name IS NOT NULL

    UNION ALL

    -- Ticto
    SELECT
      COALESCE(cil.unified_customer_id::text, 'email:' || LOWER(TRIM(tt.customer_email))) AS customer_id,
      fn_normalize_product(tt.product_name) AS product_name
    FROM ticto_transactions tt
    LEFT JOIN customer_identity_links cil
      ON cil.identifier_value = LOWER(TRIM(tt.customer_email))
      AND cil.identifier_type = 'email'
    WHERE tt.status = 'authorized'
      AND tt.product_name IS NOT NULL
  ),
  customer_products AS (
    SELECT DISTINCT customer_id, product_name
    FROM all_purchases
  ),
  product_totals AS (
    SELECT product_name, COUNT(DISTINCT customer_id) AS total_buyers
    FROM customer_products
    GROUP BY product_name
  ),
  pairs AS (
    SELECT
      a.product_name AS product_a,
      b.product_name AS product_b,
      COUNT(DISTINCT a.customer_id) AS buyers_both
    FROM customer_products a
    JOIN customer_products b
      ON a.customer_id = b.customer_id
      AND a.product_name <> b.product_name
    GROUP BY a.product_name, b.product_name
  )
  SELECT
    p.product_a,
    p.product_b,
    p.buyers_both,
    pt.total_buyers AS buyers_of_a,
    ROUND((p.buyers_both::numeric / NULLIF(pt.total_buyers, 0) * 100), 1) AS cross_sell_pct
  FROM pairs p
  JOIN product_totals pt ON pt.product_name = p.product_a
  WHERE pt.total_buyers >= 5
  ORDER BY p.product_a, cross_sell_pct DESC;
$$;
