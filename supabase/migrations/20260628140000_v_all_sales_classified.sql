-- ═══════════════════════════════════════════════════════════════════
-- VIEW: v_all_sales_classified — classificação DURÁVEL (fonte: banco)
--
-- Por quê: a classificação de funil (principal/bump/upsell) vivia só no
-- front (src/lib/classifyTransaction.ts + useAllSales.ts), com mapa
-- hardcoded incompleto. Em 25/06 uma reescrita passou a EXCLUIR vendas
-- 'other' do total → order bumps/upsells e receita "sumiram" do dash.
--
-- Esta view materializa a posição no funil a partir de `funnel_products`
-- (que já mapeia 96% das vendas por product_id+platform), de forma
-- ADITIVA: não altera v_all_sales. O front passa a LER `funnel_position`
-- daqui, então nenhuma mudança de código no front quebra mais a contagem.
--
-- Match: Pass 1 = product_id + platform; Pass 2 = product_name_contains.
-- Pass 1 tem prioridade (source of truth).
-- ═══════════════════════════════════════════════════════════════════

create or replace view public.v_all_sales_classified as
select
  s.*,
  m.role       as mapped_role,
  m.funnel_id  as mapped_funnel_id,
  case m.role
    when 'front'      then 'principal'
    when 'order_bump' then 'bump1'
    when 'upsell1'    then 'upsell1'
    when 'upsell2'    then 'upsell1'
    when 'upsell3'    then 'upsell1'
    when 'downsell'   then 'downsell'
    else 'other'
  end as funnel_position
from public.v_all_sales s
left join lateral (
  select fp.role, fp.funnel_id
  from public.funnel_products fp
  where (
          fp.product_id is not null
          and fp.product_id = s.product_id
          and (fp.platform is null or lower(fp.platform) = lower(s.platform))
        )
     or (
          fp.product_name_contains is not null
          and s.product_name is not null
          and lower(s.product_name) like '%' || lower(fp.product_name_contains) || '%'
          and (fp.platform is null or lower(fp.platform) = lower(s.platform))
        )
  -- Pass 1 (match exato de product_id) vence Pass 2 (nome)
  order by (fp.product_id is not null and fp.product_id = s.product_id) desc
  limit 1
) m on true;

grant select on public.v_all_sales_classified to authenticated;
grant select on public.v_all_sales_classified to service_role;

comment on view public.v_all_sales_classified is
  'v_all_sales + funnel_position/mapped_role/mapped_funnel_id derivados de funnel_products. Fonte durável da classificação lida pelo dashboard.';
