-- ============================================
-- WhatsApp Chat — Shortcuts & Notes Migration
-- Execute no SQL Editor do Supabase
-- ============================================

-- 1. Tabela whatsapp_shortcuts (respostas rápidas)
create table if not exists public.whatsapp_shortcuts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  category text not null default 'Geral',
  title text not null,
  body text not null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.whatsapp_shortcuts enable row level security;

create policy "Org members can view shortcuts"
  on public.whatsapp_shortcuts for select to authenticated
  using (organization_id = public.get_user_org_id());

create policy "Org members can insert shortcuts"
  on public.whatsapp_shortcuts for insert to authenticated
  with check (organization_id = public.get_user_org_id());

create policy "Org members can update shortcuts"
  on public.whatsapp_shortcuts for update to authenticated
  using (organization_id = public.get_user_org_id());

create policy "Org members can delete shortcuts"
  on public.whatsapp_shortcuts for delete to authenticated
  using (organization_id = public.get_user_org_id());

-- 2. Tabela whatsapp_contact_notes (notas internas)
create table if not exists public.whatsapp_contact_notes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  phone text not null,
  content text not null,
  created_by uuid references auth.users(id),
  created_at timestamptz default now()
);

alter table public.whatsapp_contact_notes enable row level security;

create policy "Org members can view notes"
  on public.whatsapp_contact_notes for select to authenticated
  using (organization_id = public.get_user_org_id());

create policy "Org members can insert notes"
  on public.whatsapp_contact_notes for insert to authenticated
  with check (organization_id = public.get_user_org_id());

create policy "Org members can delete notes"
  on public.whatsapp_contact_notes for delete to authenticated
  using (organization_id = public.get_user_org_id());

-- Indexes
create index idx_whatsapp_shortcuts_org on public.whatsapp_shortcuts(organization_id);
create index idx_whatsapp_contact_notes_phone on public.whatsapp_contact_notes(phone);
create index idx_whatsapp_contact_notes_org on public.whatsapp_contact_notes(organization_id);
