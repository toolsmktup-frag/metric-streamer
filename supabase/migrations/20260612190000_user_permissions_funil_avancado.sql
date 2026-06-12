-- Permissão individual "Funil avançado": libera as abas Flow Editor, Métricas,
-- Configuração, Automações e Webhook do funil de leads para um vendedor
-- específico (toggle na página Equipe), sem precisar promovê-lo a admin/gestor.
-- Ações destrutivas (ex.: Limpar Funil) continuam restritas a admin/gestor no front.
ALTER TABLE public.user_permissions
  ADD COLUMN IF NOT EXISTS mod_funil_avancado boolean NOT NULL DEFAULT false;
