-- KANGEST ONE, fase B2: as encomendas do site no livro único de stock (em sombra, como a B1: o stock à venda continua
-- a sair de stock_books e de kangest_stock até à fase B3).
--
-- O checkout já desconta o stock à venda e regista-o no histórico (`stock_movements`, motivo «venda», com o número da
-- encomenda); o cancelamento devolve-o (motivo «cancelamento»). O livro recebe o mesmo, por gatilhos:
-- - **a reserva:** a venda do checkout entra no livro como `reserva`, na loja da encomenda. O checkout desconta o stock
--   antes de gravar a encomenda, por isso as reservas entram depois de ela estar gravada (com a loja);
-- - **a libertação:** o cancelamento liberta as reservas da encomenda que ainda estão por libertar. Quando o posto do
--   KanGest emite a FR da encomenda (`kangest_fila`, «fr» feito, com o posto), as reservas também se libertam: a saída
--   passa a ser a venda do posto, que chega pelo livro do posto (B1). Uma reserva liberta-se uma vez só (a chave);
--   depois de uma FR, a anulação do posto chega também pelo livro do posto, e o cancelamento no site não liberta outra
--   vez;
-- - **as devoluções** físicas fazem-se no KanGest (a nota de crédito), e chegam pelo livro do posto. O reembolso do site
--   só mexe no dinheiro.
--
-- Nada disto pode impedir uma encomenda nem um cancelamento: um erro fica num aviso (raise warning) e o livro fica por
-- acertar, à vista no painel. As variantes (versões com stock próprio) ainda não entram: o histórico só regista o stock
-- do livro.

-- A referência do produto no livro: a do KanGest, ou o id do produto se não a tiver.
create or replace function private.stock_livro_referencia(p_book text)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select left(coalesce(nullif(btrim(b.kigest_ref), ''), 'livro:' || b.id), 60) from public.stock_books b where b.id = p_book;
$$;
revoke all on function private.stock_livro_referencia(text) from public, anon, authenticated;

-- As reservas de uma encomenda: as vendas do histórico com o número dela que ainda não estão no livro.
create or replace function private.stock_livro_reservar(p_order public.orders)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_n integer;
begin
  if coalesce(p_order.order_number, '') = '' then
    return 0;
  end if;
  insert into public.stock_movimentos (store_id, referencia, book_id, tipo, quantidade, origem, documento, chave, momento)
  select p_order.store_id, coalesce(private.stock_livro_referencia(m.book_id), 'livro:' || m.book_id), m.book_id, 'reserva', m.delta,
         'site:checkout', left(p_order.order_number, 60), 'site:reserva:' || m.id::text, m.created
    from public.stock_movements m
   where m.reference = p_order.order_number and m.reason = 'venda' and m.delta < 0
  on conflict (chave) do nothing;
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;
revoke all on function private.stock_livro_reservar(public.orders) from public, anon, authenticated;

-- Liberta as reservas de uma encomenda que ainda estão por libertar (uma vez só cada uma).
create or replace function private.stock_livro_libertar(p_order_number text, p_momento timestamptz, p_motivo text)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_n integer;
begin
  if coalesce(p_order_number, '') = '' then
    return 0;
  end if;
  insert into public.stock_movimentos (store_id, referencia, book_id, tipo, quantidade, origem, documento, chave, momento)
  select r.store_id, r.referencia, r.book_id, 'libertacao', -r.quantidade, left('site:' || p_motivo, 120), r.documento,
         'site:libertacao:' || r.chave, coalesce(p_momento, now())
    from public.stock_movimentos r
   where r.tipo = 'reserva' and r.origem = 'site:checkout' and r.documento = left(p_order_number, 60)
  on conflict (chave) do nothing;
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;
revoke all on function private.stock_livro_libertar(text, timestamptz, text) from public, anon, authenticated;

-- A encomenda gravada: as reservas dela.
create or replace function private.stock_livro_encomenda_nova()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  begin
    perform private.stock_livro_reservar(new);
  exception when others then
    raise warning 'Livro de stock: as reservas da encomenda % ficaram por gravar (%).', new.order_number, sqlerrm;
  end;
  return null;
end;
$$;
revoke all on function private.stock_livro_encomenda_nova() from public, anon, authenticated;
drop trigger if exists orders_stock_livro on public.orders;
create trigger orders_stock_livro after insert on public.orders
  for each row execute function private.stock_livro_encomenda_nova();

-- O histórico do stock do site: uma venda de uma encomenda já gravada reserva; um cancelamento liberta.
create or replace function private.stock_livro_do_historico()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.orders;
begin
  if coalesce(new.reference, '') = '' or new.reason not in ('venda', 'cancelamento') then
    return null;
  end if;
  begin
    if new.reason = 'venda' and new.delta < 0 then
      select * into v_order from public.orders o where o.order_number = new.reference limit 1;
      if v_order.id is not null then
        perform private.stock_livro_reservar(v_order);
      end if;
    elsif new.reason = 'cancelamento' and new.delta > 0 then
      perform private.stock_livro_libertar(new.reference, new.created, 'cancelamento');
    end if;
  exception when others then
    raise warning 'Livro de stock: o movimento % da encomenda % ficou por gravar (%).', new.id, new.reference, sqlerrm;
  end;
  return null;
end;
$$;
revoke all on function private.stock_livro_do_historico() from public, anon, authenticated;
drop trigger if exists stock_movements_livro on public.stock_movements;
create trigger stock_movements_livro after insert on public.stock_movements
  for each row execute function private.stock_livro_do_historico();

-- A FR da encomenda emitida por um posto: a saída passa a ser a venda dele (livro do posto), e as reservas libertam-se.
create or replace function private.stock_livro_fr_do_posto()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_numero text;
begin
  if new.accao <> 'fr' or new.estado <> 'feito' or old.estado is not distinct from 'feito' or new.posto_id is null then
    return null;
  end if;
  begin
    select o.order_number into v_numero from public.orders o where o.id = new.order_id;
    perform private.stock_livro_libertar(v_numero, now(), 'fr do posto');
  exception when others then
    raise warning 'Livro de stock: as reservas da encomenda % ficaram por libertar (%).', new.order_id, sqlerrm;
  end;
  return null;
end;
$$;
revoke all on function private.stock_livro_fr_do_posto() from public, anon, authenticated;
drop trigger if exists kangest_fila_stock_livro on public.kangest_fila;
create trigger kangest_fila_stock_livro after update of estado on public.kangest_fila
  for each row execute function private.stock_livro_fr_do_posto();

-- Para o painel: as reservas do site por libertar (as encomendas que o posto ainda não facturou nem foram canceladas).
create or replace function public.stock_livro_site_resumo()
returns table (reservas_abertas bigint, unidades numeric, encomendas bigint)
language sql
stable
security definer
set search_path = ''
as $$
  select count(*), coalesce(-sum(r.quantidade), 0), count(distinct r.documento)
    from public.stock_movimentos r
   where r.tipo = 'reserva' and r.origem = 'site:checkout'
     and not exists (select 1 from public.stock_movimentos l where l.chave = 'site:libertacao:' || r.chave);
$$;
revoke all on function public.stock_livro_site_resumo() from public, anon, authenticated;
grant execute on function public.stock_livro_site_resumo() to service_role;
