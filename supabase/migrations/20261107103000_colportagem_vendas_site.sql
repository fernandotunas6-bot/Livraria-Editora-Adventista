-- Colportagem: vendas no site com o código do colportor.
--
-- O cliente chega pelo link do colportor (livrariaadventista.com/?c=CPT-0007) ou escreve o código
-- no checkout. A Edge Function passa o código à encomenda; aqui confirma-se que é de um colportor
-- activo e guarda-se quem é. A comissão (modo "site") entra na conta corrente do colportor quando a
-- venda fica fechada: paga E entregue, e não cancelada. Se depois for cancelada ou reembolsada, a
-- comissão é anulada com uma linha de correcção.
--
-- Decisões:
-- · Um código inválido, de um colportor que não está activo, ou do próprio colportor a comprar com
--   a sua conta, é ignorado: nunca impede a compra, só não dá comissão. Para comprar para si, o
--   colportor usa a guia de compra com desconto.
-- · A base da comissão é o que o cliente pagou pelos produtos (sem portes), com a percentagem de
--   cada tipo de produto em vigor no dia da encomenda.
-- · Só uma comissão e uma anulação por encomenda (índice único em colporteur_ledger).
-- · A equipa com "Encomendas" pode corrigir o código numa encomenda, enquanto a comissão não entrou.
--
-- Reverter: drop dos triggers orders_colportor_codigo e orders_colportor_comissao, das funções e das
-- colunas orders.colporteur_id / colporteur_code; repor colporteur_overview de 20261107102000.

alter table public.orders
  add column if not exists colporteur_code text,
  add column if not exists colporteur_id uuid references public.colporteurs(id) on delete set null;
create index if not exists orders_colporteur_idx on public.orders (colporteur_id) where colporteur_id is not null;
comment on column public.orders.colporteur_code is 'Código do colportor que trouxe a venda (CPT-…), confirmado pela base de dados.';

-- 1. O código vira colportor (ou nada) ---------------------------------------------------------------
create or replace function private.orders_colportor_codigo()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_code text := nullif(public.normalize_person_code(new.colporteur_code), '');
  v_c public.colporteurs;
begin
  if tg_op = 'UPDATE' then
    if new.colporteur_code is not distinct from old.colporteur_code then
      new.colporteur_id := old.colporteur_id;   -- o id nunca vem de fora
      return new;
    end if;
    if exists (select 1 from public.colporteur_ledger where order_id = new.id and kind = 'comissao') then
      raise exception 'A comissão desta encomenda já foi paga ao colportor: não se muda o código.' using errcode = '42501';
    end if;
  end if;
  new.colporteur_id := null;
  if v_code is null or v_code !~ '^CPT-[0-9]+$' then
    new.colporteur_code := null;
    return new;
  end if;
  select * into v_c from public.colporteurs where code = v_code and status = 'activo';
  if v_c.id is null or (v_c.profile_id is not null and v_c.profile_id = new.customer_id) then
    new.colporteur_code := null;
    return new;
  end if;
  new.colporteur_code := v_c.code;
  new.colporteur_id := v_c.id;
  return new;
end;
$$;
revoke all on function private.orders_colportor_codigo() from public, anon, authenticated;
drop trigger if exists orders_colportor_codigo on public.orders;
create trigger orders_colportor_codigo before insert or update of colporteur_code, colporteur_id on public.orders
  for each row execute function private.orders_colportor_codigo();

-- 2. Comissão quando a venda fecha; anulação se for desfeita ---------------------------------------------
-- Comissão de uma encomenda (positiva), com a percentagem por tipo de produto no dia da encomenda.
create or replace function private.colporteur_order_commission(p_order public.orders)
returns numeric
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(sum(round(
    coalesce((it ->> 'price')::numeric, 0) * coalesce((it ->> 'quantity')::numeric, 1)
    * private.colporteur_pct(p_order.colporteur_id, coalesce(it ->> 'product_type', 'livro'), 'site', p_order.created::date) / 100, 2)), 0)
  from jsonb_array_elements(case when jsonb_typeof(p_order.items) = 'array' then p_order.items else '[]'::jsonb end) it;
$$;
revoke all on function private.colporteur_order_commission(public.orders) from public, anon, authenticated;

create or replace function private.orders_colportor_comissao()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_closed boolean;
  v_undone boolean;
  v_amount numeric;
  v_earned numeric;
begin
  if new.colporteur_id is null then return new; end if;
  v_closed := new.payment_status = 'paid' and new.delivery_status = 'delivered' and coalesce(new.status, '') <> 'cancelled';
  v_undone := coalesce(new.status, '') = 'cancelled' or new.payment_status = 'refunded' or new.delivery_status = 'cancelled';
  select -amount into v_earned from public.colporteur_ledger where order_id = new.id and kind = 'comissao';

  if v_closed and v_earned is null then
    v_amount := private.colporteur_order_commission(new);
    if v_amount > 0 then
      insert into public.colporteur_ledger (colporteur_id, kind, amount, description, order_id, actor)
      values (new.colporteur_id, 'comissao', -v_amount, 'Venda no site · ' || coalesce(new.order_number, new.id), new.id, auth.uid())
      on conflict do nothing;
    end if;
  elsif v_undone and v_earned is not null then
    insert into public.colporteur_ledger (colporteur_id, kind, amount, description, order_id, actor)
    values (new.colporteur_id, 'ajuste', v_earned, 'Anulação da comissão · ' || coalesce(new.order_number, new.id)
            || case when new.payment_status = 'refunded' then ' (reembolsada)' else ' (cancelada)' end, new.id, auth.uid())
    on conflict do nothing;
  end if;
  return new;
end;
$$;
revoke all on function private.orders_colportor_comissao() from public, anon, authenticated;
drop trigger if exists orders_colportor_comissao on public.orders;
create trigger orders_colportor_comissao after insert or update of status, payment_status, delivery_status, colporteur_id on public.orders
  for each row execute function private.orders_colportor_comissao();

-- 3. O que o colportor e a equipa vêem -------------------------------------------------------------------
-- Vendas no site de um colportor (sem dados do cliente): número, data, valor dos produtos, estados
-- e a comissão (paga, ou prevista enquanto a venda não fecha).
create or replace function private.colporteur_site_sales(p_colporteur uuid, p_limit integer default 100)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(x order by x ->> 'created' desc), '[]'::jsonb) from (
    select jsonb_build_object(
      'order_id', o.id,
      'order_number', o.order_number,
      'created', o.created,
      'products_value', coalesce((select sum(coalesce((it ->> 'price')::numeric, 0) * coalesce((it ->> 'quantity')::numeric, 1))
                                  from jsonb_array_elements(case when jsonb_typeof(o.items) = 'array' then o.items else '[]'::jsonb end) it), 0),
      'status', o.status, 'payment_status', o.payment_status, 'delivery_status', o.delivery_status,
      'commission', coalesce((select -amount from public.colporteur_ledger l where l.order_id = o.id and l.kind = 'comissao'), 0),
      'cancelled_commission', exists (select 1 from public.colporteur_ledger l where l.order_id = o.id and l.kind = 'ajuste'),
      'expected', case when coalesce(o.status, '') = 'cancelled' or o.payment_status = 'refunded' or o.delivery_status = 'cancelled' then 0
                       else private.colporteur_order_commission(o) end
    ) x
    from public.orders o
    where o.colporteur_id = p_colporteur
    order by o.created desc
    limit greatest(1, least(coalesce(p_limit, 100), 500))
  ) s;
$$;
revoke all on function private.colporteur_site_sales(uuid, integer) from public, anon, authenticated;

-- colporteur_overview passa a trazer também as vendas no site.
create or replace function public.colporteur_overview(p_colporteur uuid default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_staff boolean := private.can_manage_colporteurs();
  v_self uuid := (select id from public.colporteurs where profile_id = auth.uid());
begin
  if not v_staff then
    if v_self is null then raise exception 'Sem acesso.' using errcode = '42501'; end if;
    p_colporteur := v_self;
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'colporteur_id', c.id,
      'balance', private.colporteur_balance(c.id),
      'in_hand', coalesce((
        select jsonb_agg(jsonb_build_object('book_id', m.book_id, 'title', b.title, 'book_code', b.book_code, 'qty', m.qty, 'unit_price', b.price, 'product_type', b.product_type) order by b.title)
        from (select book_id, sum(qty)::int qty from public.colporteur_stock_moves where colporteur_id = c.id group by book_id having sum(qty) <> 0) m
        join public.stock_books b on b.id = m.book_id), '[]'::jsonb),
      'in_hand_value', coalesce((
        select sum(m.qty * b.price) from (select book_id, sum(qty) qty from public.colporteur_stock_moves where colporteur_id = c.id group by book_id) m
        join public.stock_books b on b.id = m.book_id), 0),
      'year_hours', coalesce((select sum(hours) from public.colporteur_reports where colporteur_id = c.id and status = 'validado' and week_start >= date_trunc('year', current_date)), 0),
      'year_sales', coalesce((select sum(sales_value) from public.colporteur_reports where colporteur_id = c.id and status = 'validado' and week_start >= date_trunc('year', current_date)), 0),
      'year_commission', coalesce((select -sum(amount) from public.colporteur_ledger where colporteur_id = c.id and kind = 'comissao' and entry_date >= date_trunc('year', current_date)), 0)
                         - coalesce((select sum(amount) from public.colporteur_ledger where colporteur_id = c.id and kind = 'ajuste' and order_id is not null and entry_date >= date_trunc('year', current_date)), 0),
      'last_report', (select max(week_start) from public.colporteur_reports where colporteur_id = c.id and status in ('enviado', 'validado')),
      'site_sales', private.colporteur_site_sales(c.id, case when p_colporteur is null then 20 else 100 end),
      'site_year_value', coalesce((select sum(coalesce((it ->> 'price')::numeric, 0) * coalesce((it ->> 'quantity')::numeric, 1))
                                   from public.orders o, jsonb_array_elements(case when jsonb_typeof(o.items) = 'array' then o.items else '[]'::jsonb end) it
                                   where o.colporteur_id = c.id and o.created >= date_trunc('year', current_date)
                                     and coalesce(o.status, '') <> 'cancelled' and coalesce(o.payment_status, '') <> 'refunded'), 0)
    ))
    from public.colporteurs c
    where c.code is not null and (p_colporteur is null or c.id = p_colporteur)
  ), '[]'::jsonb);
end;
$$;
revoke all on function public.colporteur_overview(uuid) from public, anon;
grant execute on function public.colporteur_overview(uuid) to authenticated, service_role;
