-- ============================================
-- WhatsApp Chat — Migration SQL
-- Execute no SQL Editor do Supabase
-- ============================================

-- 1. Enums
create type public.whatsapp_message_type as enum ('text', 'image', 'audio', 'video', 'document', 'sticker', 'location', 'contact', 'ptt');
create type public.whatsapp_direction as enum ('inbound', 'outbound');
create type public.whatsapp_status as enum ('pending', 'sent', 'delivered', 'read', 'failed');
create type public.whatsapp_instance_status as enum ('connected', 'disconnected', 'qr_pending');

-- 2. Tabela whatsapp_instances
create table public.whatsapp_instances (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  instance_name text not null,
  phone_number text,
  api_url text not null,
  api_token text not null,
  display_name text,
  profile_pic_url text,
  status public.whatsapp_instance_status default 'disconnected',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.whatsapp_instances enable row level security;

create policy "Org members can view instances"
  on public.whatsapp_instances for select to authenticated
  using (organization_id = public.get_user_org_id());

create policy "Org members can insert instances"
  on public.whatsapp_instances for insert to authenticated
  with check (organization_id = public.get_user_org_id());

create policy "Org members can update instances"
  on public.whatsapp_instances for update to authenticated
  using (organization_id = public.get_user_org_id());

create policy "Org members can delete instances"
  on public.whatsapp_instances for delete to authenticated
  using (organization_id = public.get_user_org_id());

-- 3. Tabela whatsapp_messages
create table public.whatsapp_messages (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  instance_id uuid not null references public.whatsapp_instances(id) on delete cascade,
  phone text not null,
  body text,
  message_type public.whatsapp_message_type default 'text',
  direction public.whatsapp_direction not null,
  status public.whatsapp_status default 'pending',
  media_url text,
  media_mime_type text,
  media_filename text,
  message_id_external text,
  payload_raw jsonb,
  is_deleted boolean default false,
  lead_id uuid,
  sender_name text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.whatsapp_messages enable row level security;

create policy "Org members can view messages"
  on public.whatsapp_messages for select to authenticated
  using (organization_id = public.get_user_org_id());

create policy "Org members can insert messages"
  on public.whatsapp_messages for insert to authenticated
  with check (organization_id = public.get_user_org_id());

create policy "Org members can update messages"
  on public.whatsapp_messages for update to authenticated
  using (organization_id = public.get_user_org_id());

-- Service role pode inserir (webhook)
create policy "Service role can insert messages"
  on public.whatsapp_messages for insert to service_role
  with check (true);

create policy "Service role can update messages"
  on public.whatsapp_messages for update to service_role
  using (true);

-- Indexes
create index idx_whatsapp_messages_phone on public.whatsapp_messages(phone);
create index idx_whatsapp_messages_instance on public.whatsapp_messages(instance_id);
create index idx_whatsapp_messages_created on public.whatsapp_messages(created_at desc);
create index idx_whatsapp_messages_external_id on public.whatsapp_messages(message_id_external);
create index idx_whatsapp_messages_org on public.whatsapp_messages(organization_id);

-- 4. Storage bucket
insert into storage.buckets (id, name, public)
values ('whatsapp-media', 'whatsapp-media', true)
on conflict (id) do nothing;

-- Storage policies
create policy "Authenticated users can upload whatsapp media"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'whatsapp-media');

create policy "Anyone can read whatsapp media"
  on storage.objects for select to public
  using (bucket_id = 'whatsapp-media');

-- 5. Enable realtime on whatsapp_messages
alter publication supabase_realtime add table public.whatsapp_messages;
