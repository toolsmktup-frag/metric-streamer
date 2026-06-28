-- View auxiliar: produtos que venderam (60d) mas NÃO estão classificados
-- em funnel_products (mapped_role IS NULL na view classificada).
-- É o input do motor classify-sales: o que a IA precisa mapear.

create or replace view public.v_unmapped_products as
select
  platform,
  product_id,
  max(product_name)              as product_name,
  count(*)                       as sales_count,
  round(sum(revenue))::numeric   as revenue
from public.v_all_sales_classified
where status = 'authorized'
  and purchased_at >= now() - interval '60 days'
  and mapped_role is null
  and product_id is not null
group by platform, product_id
order by sum(revenue) desc;

grant select on public.v_unmapped_products to authenticated;
grant select on public.v_unmapped_products to service_role;
