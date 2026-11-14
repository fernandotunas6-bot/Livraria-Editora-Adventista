-- Relatório mensal da colportagem (docs/COLPORTAGEM.md, secção 4, «Relatório mensal»).
--
-- O Resumo do painel passa a deixar escolher um mês (e qualquer período). Os relatórios semanais
-- já vinham todos para o browser; as vendas no site não: o colporteur_overview só traz o total do
-- ano (site_year_value) e as 20 encomendas mais recentes de cada colportor. Esta função soma-as
-- por colportor num período qualquer, com as mesmas regras do total do ano:
--   - conta a data da encomenda, em hora de Angola (de p_from às 00:00 até ao fim de p_to);
--   - não contam as canceladas nem as reembolsadas;
--   - o valor é o dos produtos (sem portes), como em private.colporteur_site_sales;
--   - a comissão é a que entrou na conta corrente por essas encomendas (comissão menos anulação).
-- Só a equipa da colportagem (private.can_manage_colporteurs). Não muda nenhum dado.
-- Reverter: drop function public.colporteur_site_period(date, date);

create or replace function public.colporteur_site_period(p_from date, p_to date)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_from timestamptz;
  v_to timestamptz;
begin
  if not private.can_manage_colporteurs() then
    raise exception 'Sem acesso.' using errcode = '42501';
  end if;
  -- Até dez anos de cada vez: chega para «Desde o início» e não deixa varrer sem limite.
  if p_from is null or p_to is null or p_to < p_from or p_to - p_from > 3660 then
    raise exception 'Período inválido.' using errcode = '22023';
  end if;
  v_from := (p_from::timestamp) at time zone 'Africa/Luanda';
  v_to := ((p_to + 1)::timestamp) at time zone 'Africa/Luanda';

  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'colporteur_id', s.colporteur_id,
             'orders', s.orders,
             'value', s.value,
             'commission', s.commission
           ) order by s.value desc, s.colporteur_id)
    from (
      select o.colporteur_id,
             count(*)::integer as orders,
             coalesce(sum(pv.value), 0) as value,
             coalesce(sum(pc.commission), 0) as commission
      from public.orders o
      cross join lateral (
        select coalesce(sum(coalesce((it ->> 'price')::numeric, 0) * coalesce((it ->> 'quantity')::numeric, 1)), 0) as value
        from jsonb_array_elements(case when jsonb_typeof(o.items) = 'array' then o.items else '[]'::jsonb end) it
      ) pv
      cross join lateral (
        select coalesce(-sum(l.amount), 0) as commission
        from public.colporteur_ledger l
        where l.order_id = o.id and l.kind in ('comissao', 'ajuste')
      ) pc
      where o.colporteur_id is not null
        and o.created >= v_from and o.created < v_to
        and coalesce(o.status, '') <> 'cancelled'
        and coalesce(o.payment_status, '') <> 'refunded'
      group by o.colporteur_id
    ) s
  ), '[]'::jsonb);
end;
$$;

comment on function public.colporteur_site_period(date, date) is
  'Vendas no site com o código de cada colportor entre p_from e p_to (datas de Angola): encomendas, valor dos produtos e comissão creditada. Só a equipa da colportagem.';

revoke all on function public.colporteur_site_period(date, date) from public, anon;
grant execute on function public.colporteur_site_period(date, date) to authenticated, service_role;
