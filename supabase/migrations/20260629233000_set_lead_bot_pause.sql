-- Coordenação humano↔IA no atendimento do WhatsApp.
-- O agente Girassol (servidor próprio) fica calado pra um contato enquanto
-- leads.metadata.bot_paused_until estiver no futuro. Dois caminhos setam esse campo:
--   (1) automático: o bot detecta resposta humana pelo número e seta ~30min (renovável);
--   (2) manual: o botão "Assumir / Devolver pra IA" na tela de atendimento, via este RPC.
-- SECURITY DEFINER pra não depender da RLS de leads (só recebe ids/timestamp).

create or replace function public.set_lead_bot_pause(p_lead_id uuid, p_until timestamptz)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_until is null then
    -- Devolver pra IA: remove a pausa
    update public.leads
      set metadata = coalesce(metadata, '{}'::jsonb) - 'bot_paused_until',
          updated_at = now()
      where id = p_lead_id;
  else
    -- Assumir: pausa o bot até p_until (armazenado como texto ISO p/ o bot ler com Date.parse)
    update public.leads
      set metadata = coalesce(metadata, '{}'::jsonb)
                     || jsonb_build_object('bot_paused_until',
                          to_char(p_until at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')),
          updated_at = now()
      where id = p_lead_id;
  end if;
end $$;

grant execute on function public.set_lead_bot_pause(uuid, timestamptz) to authenticated;
grant execute on function public.set_lead_bot_pause(uuid, timestamptz) to service_role;
