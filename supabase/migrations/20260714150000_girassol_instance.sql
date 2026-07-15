-- ─────────────────────────────────────────────────────────────────
-- Número do Girassol escolhível pela tela: instance_id aponta pra
-- whatsapp_instances. O processo na VPS troca ESCUTA (poller) e
-- RESPOSTA (api_url/api_token da instância) em runtime (TTL 60s).
-- Seed = instância atual do env da VPS.
-- ─────────────────────────────────────────────────────────────────
ALTER TABLE public.girassol_config
  ADD COLUMN IF NOT EXISTS instance_id uuid REFERENCES public.whatsapp_instances(id);

UPDATE public.girassol_config
SET instance_id = '206d59ce-07ca-4ae9-80fc-adf17549010f'
WHERE id = 1 AND instance_id IS NULL;
