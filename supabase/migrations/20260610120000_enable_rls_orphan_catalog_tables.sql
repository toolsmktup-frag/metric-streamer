-- Habilita RLS em tabelas públicas que estavam expostas ao role `anon` com grant total
-- (SELECT/INSERT/UPDATE/DELETE via PostgREST sem autenticação). Corrige o advisor
-- 0013_rls_disabled_in_public.
--
-- Estas tabelas NÃO são referenciadas pelo frontend nem pelas edge functions; portanto
-- habilitar RLS sem policy aplica deny-by-default sem impacto funcional. O acesso interno
-- (jobs/manutenção) continua disponível via service_role, que ignora RLS.

ALTER TABLE public.product_catalog ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_name_aliases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public._backup_ticto_webhook_dupes_20260316 ENABLE ROW LEVEL SECURITY;
