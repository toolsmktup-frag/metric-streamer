-- Permissão individual "Rastreios": libera a aba de Logística/Rastreios
-- (cadastro de código de rastreio + disparo controlado) para um usuário
-- específico (toggle na página Equipe), sem precisar promovê-lo a admin/gestor.
-- Um usuário "logística" recebe APENAS mod_rastreios=true e enxerga só essa aba.
ALTER TABLE public.user_permissions
  ADD COLUMN IF NOT EXISTS mod_rastreios boolean NOT NULL DEFAULT false;

-- Donos (admin/gestor) já enxergam a aba de imediato; vendedoras/logística
-- continuam por toggle explícito.
UPDATE public.user_permissions up
  SET mod_rastreios = true,
      updated_at = now()
  FROM public.user_profiles pr
  WHERE pr.id = up.user_id
    AND pr.role IN ('admin', 'gestor')
    AND up.mod_rastreios = false;
