-- ============================================================================
-- Mensagens Programadas no Chat
--
-- A vendedora agenda um follow-up (texto ou áudio gravado por ela) para um
-- contato específico. No horário marcado, a mensagem sai PELA INSTÂNCIA que ela
-- estava usando — mesmo número, voz dela.
--
-- Nada aqui altera tabelas existentes: só cria a tabela nova, suas policies e
-- o gatilho de cron que chama a edge function `scheduled-messages-dispatch`.
-- ============================================================================

create table if not exists public.scheduled_messages (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,

  -- destino e canal
  instance_id uuid not null references public.whatsapp_instances(id) on delete cascade,
  phone text not null,                       -- forma canônica BR (br_canonical_phone)
  lead_id uuid,                              -- opcional: vínculo com o lead do CRM
  contact_name text,                         -- só para exibir na lista

  -- conteúdo
  message_type text not null default 'text' check (message_type in ('text','audio')),
  body text,                                 -- texto da mensagem
  media_url text,                            -- áudio já gravado (bucket whatsapp-media)
  media_mime_type text,
  audio_duration_seconds int,

  -- agendamento
  scheduled_for timestamptz not null,

  -- ciclo de vida
  status text not null default 'scheduled'
    check (status in ('scheduled','sent','failed','canceled')),
  attempts int not null default 0,
  last_error text,
  sent_at timestamptz,
  sent_message_id uuid,                      -- id da linha em whatsapp_messages

  -- autoria
  created_by uuid not null,
  canceled_by uuid,
  canceled_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- conteúdo coerente com o tipo
  constraint scheduled_messages_content_check check (
    (message_type = 'text'  and coalesce(btrim(body), '') <> '')
    or
    (message_type = 'audio' and coalesce(btrim(media_url), '') <> '')
  )
);

comment on table public.scheduled_messages is
  'Follow-ups agendados pelas vendedoras no chat. Enviados pela própria instância da vendedora no horário marcado.';

-- Fila do carteiro: pega o que venceu, em ordem.
create index if not exists idx_scheduled_messages_due
  on public.scheduled_messages (scheduled_for)
  where status = 'scheduled';

-- Lista lateral por conversa (instância + telefone).
create index if not exists idx_scheduled_messages_conversa
  on public.scheduled_messages (organization_id, instance_id, phone, scheduled_for desc);

-- Lista geral "minhas programadas".
create index if not exists idx_scheduled_messages_autor
  on public.scheduled_messages (organization_id, created_by, scheduled_for desc);

-- updated_at automático
create or replace function public.touch_scheduled_messages()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_touch_scheduled_messages on public.scheduled_messages;
create trigger trg_touch_scheduled_messages
  before update on public.scheduled_messages
  for each row execute function public.touch_scheduled_messages();

-- ─── RLS ────────────────────────────────────────────────────────────────────
-- Vendedora enxerga e mexe apenas nas próprias; admin/gestor enxerga tudo da org.
alter table public.scheduled_messages enable row level security;

create policy "Ver programadas da org (própria ou admin)"
  on public.scheduled_messages for select
  using (
    organization_id = public.get_user_org_id()
    and (
      created_by = auth.uid()
      or exists (
        select 1 from public.user_profiles p
        where p.id = auth.uid() and p.role in ('admin','gestor')
      )
    )
  );

create policy "Criar programadas para si"
  on public.scheduled_messages for insert
  with check (
    organization_id = public.get_user_org_id()
    and created_by = auth.uid()
  );

create policy "Atualizar as próprias programadas (ou admin)"
  on public.scheduled_messages for update
  using (
    organization_id = public.get_user_org_id()
    and (
      created_by = auth.uid()
      or exists (
        select 1 from public.user_profiles p
        where p.id = auth.uid() and p.role in ('admin','gestor')
      )
    )
  );

-- O carteiro (service role) precisa ler e marcar o resultado do envio.
create policy "Service role gerencia programadas"
  on public.scheduled_messages for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

-- ─── Gatilho de cron ────────────────────────────────────────────────────────
-- Mesmo padrão de trigger_tracking_dispatch: só chama a função quando há fila,
-- lendo url/token de public.cron_secrets.
create or replace function public.trigger_scheduled_messages()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_url     text;
  v_key     text;
  v_pending int;
begin
  select count(*) into v_pending
  from public.scheduled_messages
  where status = 'scheduled' and scheduled_for <= now();

  if v_pending = 0 then
    return;
  end if;

  select value into v_url from public.cron_secrets where key = 'supabase_url';
  select value into v_key from public.cron_secrets where key = 'scheduled_messages_token';

  if v_url is null or v_key is null then
    raise warning 'trigger_scheduled_messages: cron_secrets (supabase_url/scheduled_messages_token) não configurados.';
    return;
  end if;

  perform net.http_post(
    url     := v_url || '/functions/v1/scheduled-messages-dispatch',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer ' || v_key
    ),
    body    := '{}'::jsonb
  );
end;
$$;

-- Roda a cada minuto (a função sai na hora se a fila estiver vazia).
select cron.unschedule('scheduled-messages-1min')
where exists (select 1 from cron.job where jobname = 'scheduled-messages-1min');

select cron.schedule(
  'scheduled-messages-1min',
  '* * * * *',
  $$ select public.trigger_scheduled_messages(); $$
);
