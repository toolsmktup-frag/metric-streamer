-- RPC pra vincular uma campanha do Meta a um funil (e propagar p/ adsets/ads).
-- Usada pela tela "Vínculo de Campanhas": o auto-assign só acerta quando o nome
-- da campanha casa com o produto/funil — quando a conta é compartilhada entre
-- funis (ex: Articulabem/Clube Secreto/RevitaSoul) ele erra. Aqui o usuário
-- corrige na mão, de forma controlada. SECURITY DEFINER pra contornar RLS com
-- segurança (só recebe ids).

create or replace function public.set_campaign_funnel(p_campaign_id uuid, p_funnel_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.meta_campaigns set funnel_id = p_funnel_id where id = p_campaign_id;
  update public.meta_adsets   set funnel_id = p_funnel_id where campaign_id = p_campaign_id;
  update public.meta_ads      set funnel_id = p_funnel_id where campaign_id = p_campaign_id;
end $$;

grant execute on function public.set_campaign_funnel(uuid, uuid) to authenticated;
grant execute on function public.set_campaign_funnel(uuid, uuid) to service_role;
