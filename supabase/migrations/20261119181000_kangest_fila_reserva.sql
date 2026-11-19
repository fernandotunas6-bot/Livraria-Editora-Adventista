-- KanGest: a fila não trata o mesmo documento duas vezes (docs/KANGEST.md §5).
--
-- O agendador (de 5 em 5 minutos) e o «Sincronizar já» do painel podiam ler a mesma linha pendente ao mesmo tempo.
-- A Idempotency-Key protege a NE, a FR e a NC, mas uma anulação repetida dava erro. Agora cada linha é reservada
-- (estado «processando», numa transacção, saltando as que outro já reservou); uma reservada há mais de 10 minutos
-- (a função caiu a meio) volta à fila sozinha.

alter table public.kangest_fila drop constraint if exists kangest_fila_estado_check;
alter table public.kangest_fila add constraint kangest_fila_estado_check
  check (estado in ('pendente', 'processando', 'feito', 'erro', 'ignorado'));

create or replace function public.kangest_reservar(p_limite int default 25)
returns setof public.kangest_fila
language sql
security definer
set search_path = ''
as $$
  update public.kangest_fila f set estado = 'processando', actualizado = now()
  where f.id in (
    select id from public.kangest_fila
    where (estado = 'pendente' and proxima <= now())
       or (estado = 'processando' and actualizado < now() - interval '10 minutes')
    order by id
    limit greatest(least(coalesce(p_limite, 25), 100), 1)
    for update skip locked
  )
  returning f.*;
$$;
revoke all on function public.kangest_reservar(int) from public, anon, authenticated;
grant execute on function public.kangest_reservar(int) to service_role;

-- O stock à venda desconta também as encomendas cuja NE está a ser emitida neste momento.
create or replace function public.kangest_recalcular_stock(p_referencia text)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_n integer := 0;
  b record;
  v_disp numeric;
  v_pendente numeric;
begin
  if coalesce(btrim(p_referencia), '') = '' then
    return 0;
  end if;
  select coalesce(sum(disponivel), 0) into v_disp
    from public.kangest_stock where referencia = p_referencia and online;
  for b in
    select id from public.stock_books
    where kigest_ref = p_referencia
      and (versions is null or jsonb_typeof(versions) <> 'array' or jsonb_array_length(versions) = 0)
  loop
    select coalesce(sum((it ->> 'quantity')::numeric), 0) into v_pendente
      from public.kangest_fila f
      join public.orders o on o.id = f.order_id
      cross join lateral jsonb_array_elements(coalesce(o.items, '[]'::jsonb)) it
      where f.accao = 'ne' and f.estado in ('pendente', 'processando', 'erro')
        and it ->> 'book_id' = b.id and coalesce(it ->> 'digital', '') <> 'true'
        and not private.kangest_cancelada(o);
    perform set_config('app.stock_reason', 'kangest', true);
    perform set_config('app.stock_ref', p_referencia, true);
    update public.stock_books set stock = greatest(v_disp - v_pendente, 0) where id = b.id and stock is distinct from greatest(v_disp - v_pendente, 0);
    perform set_config('app.stock_reason', '', true);
    perform set_config('app.stock_ref', '', true);

    insert into public.store_stock (store_id, book_id, available, updated)
    select s.store_id, b.id, sum(s.disponivel) > 0, now()
      from public.kangest_stock s
      where s.referencia = p_referencia and s.store_id is not null
      group by s.store_id
    on conflict (store_id, book_id) do update set available = excluded.available, updated = now()
      where public.store_stock.available is distinct from excluded.available;
    v_n := v_n + 1;
  end loop;
  return v_n;
end;
$$;

revoke all on function public.kangest_recalcular_stock(text) from public, anon, authenticated;
grant execute on function public.kangest_recalcular_stock(text) to service_role;

-- A encomenda cancelada (ou reembolsada) enquanto o documento estava a ser emitido: o gatilho das encomendas
-- só vê «processando» e não sabe ainda se o documento chegou ao KanGest. Quando chega, trata-se aqui.
create or replace function private.kangest_fila_concluida()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  o public.orders;
begin
  select * into o from public.orders where id = new.order_id;
  if not found then
    return new;
  end if;
  if new.accao = 'ne' and private.kangest_cancelada(o)
     and not exists (select 1 from public.kangest_fila where order_id = new.order_id and accao = 'fr' and estado in ('processando', 'feito')) then
    update public.kangest_fila set estado = 'ignorado', erro = 'Encomenda cancelada antes de chegar ao KanGest.', actualizado = now()
      where order_id = new.order_id and accao = 'fr' and estado in ('pendente', 'erro');
    insert into public.kangest_fila (order_id, accao) values (new.order_id, 'anular') on conflict do nothing;
  elsif new.accao = 'fr' and coalesce(o.payment_status, '') = 'refunded' then
    insert into public.kangest_fila (order_id, accao) values (new.order_id, 'nc') on conflict do nothing;
  end if;
  return new;
end;
$$;

drop trigger if exists kangest_fila_concluida on public.kangest_fila;
create trigger kangest_fila_concluida
  after update of estado on public.kangest_fila
  for each row when (new.estado = 'feito' and old.estado is distinct from 'feito')
  execute function private.kangest_fila_concluida();

create index if not exists kangest_fila_processando_idx on public.kangest_fila (actualizado) where estado = 'processando';

-- Mais rápido: a sincronização de hora a hora recalculava o stock com um pedido por referência (milhares de idas e
-- voltas da Edge Function à base). Agora vai em lotes; e as encomendas por reservar lêem-se por um índice pequeno.
create or replace function public.kangest_recalcular_stock_lote(p_referencias text[])
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_n integer := 0;
  r text;
begin
  foreach r in array coalesce(p_referencias, '{}'::text[]) loop
    v_n := v_n + public.kangest_recalcular_stock(r);
  end loop;
  return v_n;
end;
$$;
revoke all on function public.kangest_recalcular_stock_lote(text[]) from public, anon, authenticated;
grant execute on function public.kangest_recalcular_stock_lote(text[]) to service_role;

create index if not exists kangest_fila_ne_abertas_idx on public.kangest_fila (order_id)
  where accao = 'ne' and estado in ('pendente', 'processando', 'erro');
