-- ============================================
-- WhatsApp Templates (Meta Cloud API)
-- Espelho local dos message templates da WABA + suporte ao "bypass":
-- sample_variables (genéricos, enviados à Meta) vs marketing_variables
-- (agressivos, substituídos no disparo real).
-- ============================================

create table if not exists public.whatsapp_templates (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  instance_id uuid references public.whatsapp_instances(id) on delete set null,

  meta_template_id text,                              -- id do template na Meta (quando existe)
  name text not null,
  language text not null default 'pt_BR',
  category text not null default 'UTILITY',           -- UTILITY | MARKETING | AUTHENTICATION
  status text not null default 'LOCAL',               -- LOCAL | PENDING | APPROVED | REJECTED | PAUSED | DISABLED
  parameter_format text default 'POSITIONAL',         -- POSITIONAL | NAMED
  strategy text default 'bypass',                     -- marketing | utility | bypass

  components jsonb not null default '[]'::jsonb,       -- componentes Meta (HEADER, BODY, BUTTONS, FOOTER)
  sample_variables jsonb default '{}'::jsonb,          -- valores genéricos (o que a Meta vê na aprovação)
  marketing_variables jsonb default '{}'::jsonb,       -- valores promocionais (o que o cliente recebe no bypass)

  rejection_reason text,
  fetched_at timestamptz,                             -- última sincronização vinda da Meta
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (organization_id, name, language)
);

alter table public.whatsapp_templates enable row level security;

create policy "Org members can view templates"
  on public.whatsapp_templates for select to authenticated
  using (organization_id = public.get_user_org_id());

create policy "Org members can insert templates"
  on public.whatsapp_templates for insert to authenticated
  with check (organization_id = public.get_user_org_id());

create policy "Org members can update templates"
  on public.whatsapp_templates for update to authenticated
  using (organization_id = public.get_user_org_id());

create policy "Org members can delete templates"
  on public.whatsapp_templates for delete to authenticated
  using (organization_id = public.get_user_org_id());

-- Service role (edge functions de sync/create) pode gerenciar
create policy "Service role can manage templates"
  on public.whatsapp_templates for all to service_role
  using (true) with check (true);

create index if not exists idx_whatsapp_templates_org on public.whatsapp_templates(organization_id);
create index if not exists idx_whatsapp_templates_status on public.whatsapp_templates(status);
create index if not exists idx_whatsapp_templates_name on public.whatsapp_templates(name);

comment on column public.whatsapp_templates.marketing_variables is
  'Bypass: valores promocionais que substituem sample_variables no disparo real';
comment on column public.whatsapp_templates.sample_variables is
  'Valores genéricos/neutros enviados à Meta na submissão do template (aprovação UTILITY)';
