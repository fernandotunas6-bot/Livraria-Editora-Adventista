-- KANGEST ONE, fase B2 (correcção da auditoria): o resumo das reservas do site no livro de stock contava para sempre as
-- encomendas que o próprio site entrega (sem posto: a reserva fica no livro como a saída, não se liberta), e o painel
-- dizia «à espera da factura do posto ou do cancelamento» mesmo depois de entregues. Agora só conta as encomendas ainda
-- em curso: nem entregues nem canceladas.
create or replace function public.stock_livro_site_resumo()
returns table (reservas_abertas bigint, unidades numeric, encomendas bigint)
language sql
stable
security definer
set search_path = ''
as $$
  select count(*), coalesce(-sum(r.quantidade), 0), count(distinct r.documento)
    from public.stock_movimentos r
    join public.orders o on o.order_number = r.documento
   where r.tipo = 'reserva' and r.origem = 'site:checkout'
     and not exists (select 1 from public.stock_movimentos l where l.chave = 'site:libertacao:' || r.chave)
     and coalesce(o.status, '') <> 'cancelled'
     and coalesce(o.delivery_status, '') not in ('delivered', 'cancelled');
$$;
revoke all on function public.stock_livro_site_resumo() from public, anon, authenticated;
grant execute on function public.stock_livro_site_resumo() to service_role;
