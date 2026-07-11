-- ─────────────────────────────────────────────────────────────────
-- Incidente 10/07 (logística): a fila de rastreio encheu de cursos.
--
-- Causa: o guru-webhook tratava type="product" (que a Guru manda pra
-- QUALQUER produto) como físico → "Curso dos Erveiros", "CURSO MESTRE
-- DAS TINTURAS" e combos entravam com product_type='fisico' e o gate
-- (product_type='fisico' OR catálogo) criava o pedido de envio.
--
-- Correções:
--  1. guru-webhook deixa de usar type="product" como sinal de físico
--     (deploy junto deste PR).
--  2. "Revolução do Ser" entra no catálogo — é físico de verdade (já
--     foi enviado com rastreio 2x) mas o nome não bate em nenhum
--     padrão; sem o webhook marcando 'fisico', só o catálogo garante.
--  3. Backfill defensivo: compras Guru de curso ainda marcadas como
--     físico viram digital (idempotente; a limpeza manual de 10/07
--     pode já ter rodado via SQL direto).
-- ─────────────────────────────────────────────────────────────────

INSERT INTO public.shipping_products (product_name_contains, display_name) VALUES
  ('revolução do ser', 'Revolução do Ser (físico)')
ON CONFLICT (product_name_contains) DO NOTHING;

-- Cursos Guru marcados como físico pela inferência antiga → digital.
UPDATE public.customer_purchases
SET product_type = 'digital', updated_at = now()
WHERE platform = 'guru'
  AND product_type = 'fisico'
  AND product_name ILIKE '%curso%';

-- Tira da fila os pedidos de envio de curso que nunca andaram
-- (sem rastreio e sem disparo — os já enviados ficam como histórico).
DELETE FROM public.order_shipments
WHERE dispatch_status = 'aguardando_rastreio'
  AND tracking_code IS NULL
  AND product_name ILIKE '%curso%';
