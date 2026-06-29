-- v_unmapped_products agora também expõe as OFERTAS (offer_name) de cada
-- produto não classificado. O nome da oferta é um sinal forte da posição no
-- funil ("upsell 1", "checkout principal", "downsell", "oferta 197") — o
-- motor classify-sales usa isso pra sugerir o role com mais precisão.

create or replace view public.v_unmapped_products as
select
  platform,
  product_id,
  max(product_name)                                                  as product_name,
  count(*)                                                           as sales_count,
  round(sum(revenue))::numeric                                       as revenue,
  array_agg(distinct offer_name) filter (where offer_name is not null) as offers
from public.v_all_sales_classified
where status = 'authorized'
  and purchased_at >= now() - interval '60 days'
  and mapped_role is null
  and product_id is not null
group by platform, product_id
order by sum(revenue) desc;

grant select on public.v_unmapped_products to authenticated;
grant select on public.v_unmapped_products to service_role;
