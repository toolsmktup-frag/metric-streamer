-- ============================================================
-- Tabela: whatsapp_instance_access
-- Controla quais usuários têm acesso a quais instâncias WhatsApp
-- Admins veem todas as instâncias automaticamente (sem necessidade de registro)
-- ============================================================

CREATE TABLE IF NOT EXISTS public.whatsapp_instance_access (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  instance_id uuid NOT NULL REFERENCES public.whatsapp_instances(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  UNIQUE(user_id, instance_id)
);

-- RLS
ALTER TABLE public.whatsapp_instance_access ENABLE ROW LEVEL SECURITY;

-- Usuários podem ver seus próprios acessos
CREATE POLICY "Users can view own access"
  ON public.whatsapp_instance_access
  FOR SELECT
  TO authenticated
  USING (
    user_id = auth.uid()
    OR public.get_user_role() = 'admin'
  );

-- Apenas admins podem inserir
CREATE POLICY "Admins can insert access"
  ON public.whatsapp_instance_access
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(), 'admin')
  );

-- Apenas admins podem deletar
CREATE POLICY "Admins can delete access"
  ON public.whatsapp_instance_access
  FOR DELETE
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
  );

-- Index para queries rápidas
CREATE INDEX idx_whatsapp_instance_access_user ON public.whatsapp_instance_access(user_id);
CREATE INDEX idx_whatsapp_instance_access_instance ON public.whatsapp_instance_access(instance_id);
CREATE INDEX idx_whatsapp_instance_access_org ON public.whatsapp_instance_access(organization_id);
