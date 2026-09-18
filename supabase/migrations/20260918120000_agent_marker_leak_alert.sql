-- ════════════════════════════════════════════════════════════════════════════
-- 18/09/2026 — Marcador de controle de agente vazando para o cliente.
--
-- O prompt da Cristal manda responder "[SEM_FOLLOWUP]" quando não há follow-up
-- útil a fazer. O serviço que roda na VPS (agent-mcp) não filtra esse marcador
-- e envia o texto cru: 130 clientes receberam "[SEM_FOLLOWUP]" entre 01/09 e
-- 17/09 (~8 por dia). A correção definitiva é no remetente (VPS) — o envio sai
-- de lá direto para a uazapi e o banco não tem como impedir.
--
-- O que este arquivo faz: DETECTAR na hora em que o webhook espelha a mensagem,
-- registrar em agent_action_logs e avisar a operação no WhatsApp, no máximo uma
-- vez por hora. Serve para qualquer marcador de qualquer agente.
-- ════════════════════════════════════════════════════════════════════════════

create or replace function public.is_agent_marker(p_body text)
returns boolean language sql immutable as $$
  select coalesce(p_body, '') ~* '\[\[?\s*(SEM_FOLLOWUP|TRANSFERIR|ENCERRAR|NO_FOLLOWUP|HANDOFF)\s*\]?\]'
$$;
comment on function public.is_agent_marker(text) is
  'Detecta marcador interno de agente de IA que nunca deveria chegar ao cliente.';

create or replace function public.alert_agent_marker_leak()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_url text; v_tok text; v_dest text; v_inst text; v_recent int; v_24h int;
begin
  if new.direction <> 'outbound' or not public.is_agent_marker(new.body) then return new; end if;

  insert into public.agent_action_logs (action, params, success, actor)
  values ('agent_marker_leak',
          jsonb_build_object('message_id', new.id, 'phone', new.phone,
                             'body', new.body, 'instance_id', new.instance_id, 'at', now()),
          false, 'db_trigger');

  -- um aviso por hora, no máximo: o defeito repete várias vezes por dia e
  -- avisar em cada ocorrência viraria spam e seria ignorado.
  select count(*) into v_recent from public.agent_action_logs
  where action = 'agent_marker_leak_alert_sent' and created_at > now() - interval '1 hour';
  if v_recent > 0 then return new; end if;

  select count(*) into v_24h from public.agent_action_logs
  where action = 'agent_marker_leak' and created_at > now() - interval '24 hours';

  select i.api_url, i.api_token, i.instance_name into v_url, v_tok, v_inst
  from public.whatsapp_instances i where i.id = new.instance_id;
  select value into v_dest from public.cron_secrets where key = 'ops_alert_phone';

  if v_url is not null and v_tok is not null and nullif(v_dest,'') is not null then
    perform net.http_post(
      url := rtrim(v_url,'/') || '/send/text',
      headers := jsonb_build_object('Content-Type','application/json','token', v_tok),
      body := jsonb_build_object('number', v_dest, 'text',
        '🚨 Marcador interno vazou para cliente' || chr(10) ||
        'Instância: ' || coalesce(v_inst,'?') || chr(10) ||
        'Cliente: ' || coalesce(new.phone,'?') || chr(10) ||
        'Texto: ' || coalesce(new.body,'') || chr(10) ||
        'Nas últimas 24 h: ' || v_24h || ' ocorrência(s).' || chr(10) ||
        'Próximo aviso só daqui a 1 h.')
    );
    insert into public.agent_action_logs (action, params, success, actor)
    values ('agent_marker_leak_alert_sent', jsonb_build_object('to', v_dest, 'count_24h', v_24h), true, 'db_trigger');
  end if;
  return new;
end $$;

drop trigger if exists trg_alert_agent_marker_leak on public.whatsapp_messages;
create trigger trg_alert_agent_marker_leak
  after insert on public.whatsapp_messages
  for each row execute function public.alert_agent_marker_leak();

insert into public.cron_secrets (key, value) values ('ops_alert_phone','5548992006171')
on conflict (key) do update set value = excluded.value;
