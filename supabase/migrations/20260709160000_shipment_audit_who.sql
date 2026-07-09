-- Auditoria leve na tela de Rastreios: registrar QUEM inseriu o código
-- (e portanto quem acionou o disparo — o envio em si é do robô/cron).
-- Nome denormalizado pra exibição direta na tabela, id pra rastreabilidade.

ALTER TABLE public.order_shipments
  ADD COLUMN IF NOT EXISTS tracking_added_by      uuid REFERENCES public.user_profiles(id),
  ADD COLUMN IF NOT EXISTS tracking_added_by_name text;
