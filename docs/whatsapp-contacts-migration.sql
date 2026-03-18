-- Migration: Create whatsapp_contacts table
-- Run this manually in Supabase SQL Editor

create table public.whatsapp_contacts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references organizations(id) on delete cascade not null,
  instance_id uuid references whatsapp_instances(id) on delete cascade not null,
  phone text not null,
  name text,
  profile_pic_url text,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique(organization_id, instance_id, phone)
);

alter table public.whatsapp_contacts enable row level security;

-- Index for fast lookups
create index idx_whatsapp_contacts_org_instance on whatsapp_contacts(organization_id, instance_id);

-- RLS: org members can read contacts
create policy "Org members can view contacts"
on public.whatsapp_contacts for select
to authenticated
using (organization_id = public.get_user_org_id());

-- Service role handles inserts/updates via webhook (bypasses RLS)
