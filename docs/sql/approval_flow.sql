-- ============================================================
-- Fluxo de aprovação de novos usuários
-- Execute este script no Supabase SQL Editor
-- ============================================================

-- 1. Adicionar coluna status
ALTER TABLE public.user_profiles 
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'pending';

-- Adicionar constraint de valores válidos
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'user_profiles_status_check'
  ) THEN
    ALTER TABLE public.user_profiles 
      ADD CONSTRAINT user_profiles_status_check 
      CHECK (status IN ('pending', 'active', 'blocked'));
  END IF;
END $$;

-- 2. Atualizar constraint de role para incluir vendedor e suporte
ALTER TABLE public.user_profiles DROP CONSTRAINT IF EXISTS user_profiles_role_check;
ALTER TABLE public.user_profiles ADD CONSTRAINT user_profiles_role_check 
  CHECK (role IN ('admin', 'gestor', 'vendedor', 'vendedora', 'suporte'));

-- 3. Marcar TODOS os usuários existentes como ativos
UPDATE public.user_profiles SET status = 'active';

-- 4. Trigger para auto-criar perfil no signup com status='pending'
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.user_profiles (id, organization_id, role, status, full_name)
  VALUES (
    NEW.id,
    '00000000-0000-0000-0000-000000000001',
    'vendedor',
    'pending',
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email)
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 5. Policy para admin atualizar status/role de membros da org
-- (Drop if exists to avoid conflicts)
DROP POLICY IF EXISTS "Admin updates org profiles" ON public.user_profiles;
CREATE POLICY "Admin updates org profiles"
  ON public.user_profiles FOR UPDATE TO authenticated
  USING (
    organization_id = public.get_user_org_id()
  )
  WITH CHECK (
    organization_id = public.get_user_org_id()
  );

-- Done! Todos os usuários existentes estão como 'active'.
-- Novos signups entrarão como 'pending' até serem aprovados.
