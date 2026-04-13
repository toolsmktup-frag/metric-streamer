-- ═══════════════════════════════════════════════════════════════════
-- PASSO 1: Criar mapeamentos de nomes reais → produtos configurados
-- Funil: RECOMPRA - POTES (19f75912-295e-4c67-acad-275ce6849c5c)
--
-- Correspondência:
--   1 pote / Pote Extra  → Pote 30 dias  (d8aba5bf-6498-46ca-9dd6-ad112384912e)
--   3 potes / Upsell 1   → Pote 90 dias  (7e620568-35bf-47f8-a96a-f237b9181ecb)
--   6 potes              → Pote 180 dias (c7d1a80e-7e14-450d-bbad-6f31d11c9f51)
--   9 potes              → 9 Potes Articulabem (5be2641e-c901-45bf-b2d5-0e054f0665ff)
--   12 potes             → Pote 360 dias (0a4601b0-e352-4bc4-b597-3f9001259bca)
--   Pote Grátis          → Gratis 30 dias(a1f32030-5655-47d4-a119-888919f341cb)
--
-- IMPORTANTE: Ajuste a correspondência acima se necessário antes de rodar!
-- ═══════════════════════════════════════════════════════════════════

INSERT INTO lead_product_mappings (lead_funnel_id, raw_product_name, lead_funnel_product_id) VALUES
  -- 3 potes → 90 dias
  ('19f75912-295e-4c67-acad-275ce6849c5c', '3 potes ArticulaBEM – Soulnaturi (VSL)', '7e620568-35bf-47f8-a96a-f237b9181ecb'),
  ('19f75912-295e-4c67-acad-275ce6849c5c', '3 potes ArticulaBEM – Soulnaturi',       '7e620568-35bf-47f8-a96a-f237b9181ecb'),
  ('19f75912-295e-4c67-acad-275ce6849c5c', '3 Potes Articulabem',                     '7e620568-35bf-47f8-a96a-f237b9181ecb'),
  ('19f75912-295e-4c67-acad-275ce6849c5c', 'Upsell 1 – 3 potes ArticulaBEM – Soulnaturi', '7e620568-35bf-47f8-a96a-f237b9181ecb'),

  -- 1 pote → 30 dias
  ('19f75912-295e-4c67-acad-275ce6849c5c', '1 pote ArticulaBEM – Soulnaturi',         'd8aba5bf-6498-46ca-9dd6-ad112384912e'),

  -- 6 potes → 180 dias
  ('19f75912-295e-4c67-acad-275ce6849c5c', '6 potes ArticulaBEM – Soulnaturi',         'c7d1a80e-7e14-450d-bbad-6f31d11c9f51'),

  -- 9 potes → 360 dias (não há 270, usando 360)
  ('19f75912-295e-4c67-acad-275ce6849c5c', '9 potes ArticulaBEM – Soulnaturi',         '5be2641e-c901-45bf-b2d5-0e054f0665ff'),

  -- 12 potes → 360 dias
  ('19f75912-295e-4c67-acad-275ce6849c5c', '12 potes ArticulaBEM – Soulnaturi',        '0a4601b0-e352-4bc4-b597-3f9001259bca'),

  -- Pote Grátis → Gratis 30 dias
  ('19f75912-295e-4c67-acad-275ce6849c5c', 'Pote Grátis ArticulaBEM – Soulnaturi',     'a1f32030-5655-47d4-a119-888919f341cb'),
  ('19f75912-295e-4c67-acad-275ce6849c5c', '1 Pote Grátis do Articulabem',             'a1f32030-5655-47d4-a119-888919f341cb'),

  -- Pote Extra (bump) → 30 dias
  ('19f75912-295e-4c67-acad-275ce6849c5c', 'Pote Extra ArticulaBEM – Soulnaturi (Bump do pote grátis)', 'd8aba5bf-6498-46ca-9dd6-ad112384912e')

ON CONFLICT (lead_funnel_id, raw_product_name) DO NOTHING;
