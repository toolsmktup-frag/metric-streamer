-- ============================================
-- WhatsApp API Oficial (Meta Cloud API) — canal "official"
-- Estende whatsapp_instances para suportar números conectados via
-- WhatsApp Business Cloud API (Meta), ao lado do canal UazAPI existente.
-- ============================================

-- Novas colunas: canal + credenciais Meta
alter table public.whatsapp_instances
  add column if not exists channel text not null default 'uazapi',
  add column if not exists meta_waba_id text,
  add column if not exists meta_phone_number_id text,
  add column if not exists meta_access_token text,
  add column if not exists meta_app_secret text,
  add column if not exists meta_verify_token text;

-- api_url / api_token são exclusivos da UazAPI; instâncias oficiais não os usam
alter table public.whatsapp_instances alter column api_url drop not null;
alter table public.whatsapp_instances alter column api_token drop not null;

-- Constraint de canal (idempotente)
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'whatsapp_instances_channel_check'
  ) then
    alter table public.whatsapp_instances
      add constraint whatsapp_instances_channel_check
      check (channel in ('uazapi', 'official'));
  end if;
end $$;

create index if not exists idx_whatsapp_instances_channel
  on public.whatsapp_instances(channel);

comment on column public.whatsapp_instances.channel is
  'Canal de envio: uazapi (não-oficial) ou official (Meta WhatsApp Cloud API)';
comment on column public.whatsapp_instances.meta_phone_number_id is
  'Phone Number ID da Meta (usado no endpoint graph.facebook.com/{id}/messages)';
comment on column public.whatsapp_instances.meta_waba_id is
  'WhatsApp Business Account ID (usado para sync/criação de templates)';
