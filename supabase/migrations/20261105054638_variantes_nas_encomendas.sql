-- Variantes (tamanhos de t-shirts e uniformes, edições de livros) passam a contar na encomenda:
-- cada linha guarda a variante escolhida, com o preço e o stock dela. Antes, o checkout tirava a
-- variante do id e a encomenda não dizia que tamanho era.
-- `versions` é uma lista [{label, format, price, sale_price, stock, isbn}]; o índice é a variante.

create or replace function public.place_order(p_order jsonb, p_items jsonb, p_shipping jsonb)
 returns jsonb
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  it jsonb;
  v_book public.stock_books;
  v_qty int;
  v_price double precision;
  v_subtotal double precision := 0;
  v_ship double precision := 0;
  v_items jsonb := '[]'::jsonb;
  v_method text := coalesce(p_shipping ->> 'method', 'delivery');
  v_free double precision := coalesce((p_shipping ->> 'free_threshold')::double precision, 20000);
  v_std double precision := coalesce((p_shipping ->> 'cost')::double precision, 1500);
  v_exp double precision := coalesce((p_shipping ->> 'express_cost')::double precision, 0);
  v_payload jsonb;
  v_cols text;
  v_order jsonb;
  v_variant int;
  v_version jsonb;
  v_vlabel text;
  v_vstock int;
  v_vprice double precision;
begin
  perform set_config('app.stock_reason', 'venda', true);
  perform set_config('app.stock_ref', coalesce(p_order ->> 'order_number', ''), true);

  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Carrinho vazio.';
  end if;

  for it in select * from jsonb_array_elements(p_items) loop
    v_qty := least(greatest(coalesce((it ->> 'quantity')::int, 1), 1), 99);
    select * into v_book from public.stock_books where id = it ->> 'book_id' for update;
    if not found then raise exception 'Produto não encontrado.'; end if;
    if not coalesce(v_book.active, true) then raise exception 'Produto indisponível: %', v_book.title; end if;

    v_variant := nullif(it ->> 'variant', '')::int;
    v_version := null;
    v_vlabel := '';
    if v_variant is not null and jsonb_typeof(v_book.versions) = 'array' and v_variant >= 0 and v_variant < jsonb_array_length(v_book.versions) then
      v_version := v_book.versions -> v_variant;
      v_vlabel := btrim(concat_ws(' · ', nullif(btrim(v_version ->> 'label'), ''), nullif(btrim(v_version ->> 'format'), '')));
    elsif v_variant is not null then
      raise exception 'Variante indisponível para: %', v_book.title;
    end if;

    if coalesce(v_book.stock, 0) < v_qty then raise exception 'Stock insuficiente para: %', v_book.title; end if;
    if v_version is not null and coalesce(v_version ->> 'stock', '') ~ '^\s*-?\d+(\.\d+)?\s*$' then
      v_vstock := floor((v_version ->> 'stock')::numeric)::int;
      if v_vstock < v_qty then raise exception 'Stock insuficiente para: % (%)', v_book.title, v_vlabel; end if;
    else
      v_vstock := null;
    end if;

    -- Preço em vigor: o da variante (promocional se tiver), senão o do produto.
    v_price := public.effective_price(v_book);
    if v_version is not null then
      v_vprice := nullif(regexp_replace(coalesce(v_version ->> 'sale_price', ''), '[^0-9.]', '', 'g'), '')::double precision;
      if coalesce(v_vprice, 0) <= 0 then
        v_vprice := nullif(regexp_replace(coalesce(v_version ->> 'price', ''), '[^0-9.]', '', 'g'), '')::double precision;
      end if;
      if coalesce(v_vprice, 0) > 0 then v_price := v_vprice; end if;
    end if;
    if coalesce(v_price, 0) <= 0 then raise exception 'Preço inválido para: %', v_book.title; end if;

    v_subtotal := v_subtotal + v_price * v_qty;
    v_items := v_items || jsonb_build_array(jsonb_strip_nulls(jsonb_build_object(
      'book_id', v_book.id, 'title', v_book.title, 'book_code', coalesce(v_book.book_code, ''),
      'product_type', coalesce(v_book.product_type, 'livro'),
      'variant', v_variant, 'variant_label', nullif(v_vlabel, ''),
      'quantity', v_qty, 'price', v_price, 'list_price', v_book.price
    )));
    update public.stock_books
      set stock = coalesce(stock, 0) - v_qty,
          sales_count = coalesce(sales_count, 0) + v_qty,
          versions = case when v_vstock is not null
            then jsonb_set(versions, array[v_variant::text, 'stock'], to_jsonb(v_vstock - v_qty))
            else versions end
      where id = v_book.id;
  end loop;

  if v_exp <= 0 then v_exp := v_std * 2; end if;
  if v_method = 'pickup' then v_ship := 0;
  elsif v_method = 'express' then v_ship := greatest(v_exp, 0);
  elsif v_subtotal >= v_free then v_ship := 0;
  else v_ship := greatest(v_std, 0);
  end if;

  v_payload := p_order || jsonb_build_object(
    'id', public.gen_record_id(),
    'items', v_items,
    'shipping_cost', v_ship,
    'total', v_subtotal + v_ship
  );

  select string_agg(quote_ident(c.column_name), ', ') into v_cols
  from information_schema.columns c
  where c.table_schema = 'public' and c.table_name = 'orders' and v_payload ? c.column_name;

  execute format(
    'insert into public.orders (%s) select %s from jsonb_populate_record(null::public.orders, $1) returning to_jsonb(orders.*)',
    v_cols, v_cols
  ) into v_order using v_payload;

  return v_order;
end;
$function$;

-- Ao cancelar, o stock volta também para a variante (tamanho) da linha.
create or replace function public.orders_before_update()
 returns trigger
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  it jsonb;
  v_variant int;
  labels constant jsonb := '{"received":"Encomenda recebida","confirmed":"Encomenda confirmada","preparing":"A preparar envio","shipped":"Enviada","in_transit":"Em trânsito","out_for_delivery":"Saiu para entrega","delivered":"Entregue","cancelled":"Cancelada"}';
begin
  if old.stock_restored and coalesce(new.status, '') <> 'cancelled' and coalesce(new.delivery_status, '') <> 'cancelled' then
    raise exception 'Encomenda cancelada: o stock já foi devolvido e não pode ser reaberta.';
  end if;

  if coalesce(new.delivery_status, '') <> '' and new.delivery_status is distinct from old.delivery_status then
    new.delivery_timeline := coalesce(new.delivery_timeline, '[]'::jsonb) || jsonb_build_array(jsonb_build_object(
      'status', new.delivery_status,
      'title', coalesce(labels ->> new.delivery_status, new.delivery_status),
      'description', '',
      'location', coalesce(nullif(new.delivery_municipality, ''), nullif(new.pickup_store, ''), new.city, ''),
      'at', to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
    ));
  end if;

  if new.items is distinct from old.items or new.shipping_cost is distinct from old.shipping_cost then
    new.total := coalesce((
      select sum(coalesce((i ->> 'price')::numeric, 0) * greatest(coalesce((i ->> 'quantity')::int, 1), 0))
      from jsonb_array_elements(case when jsonb_typeof(new.items) = 'array' then new.items else '[]'::jsonb end) i
    ), 0) + coalesce(new.shipping_cost, 0);
  end if;

  if not new.stock_restored and (
    (new.status = 'cancelled' and old.status is distinct from 'cancelled') or
    (new.delivery_status = 'cancelled' and old.delivery_status is distinct from 'cancelled')
  ) then
    perform set_config('app.stock_reason', 'cancelamento', true);
    perform set_config('app.stock_ref', coalesce(new.order_number, ''), true);
    for it in select * from jsonb_array_elements(coalesce(new.items, '[]'::jsonb)) loop
      if coalesce(it ->> 'book_id', '') <> '' and coalesce((it ->> 'quantity')::int, 0) > 0 then
        v_variant := nullif(it ->> 'variant', '')::int;
        update public.stock_books b
          set stock = coalesce(b.stock, 0) + (it ->> 'quantity')::int,
              sales_count = greatest(coalesce(b.sales_count, 0) - (it ->> 'quantity')::int, 0),
              versions = case
                when v_variant is not null and jsonb_typeof(b.versions) = 'array' and v_variant < jsonb_array_length(b.versions)
                     and coalesce(b.versions -> v_variant ->> 'stock', '') ~ '^\s*-?\d+(\.\d+)?\s*$'
                then jsonb_set(b.versions, array[v_variant::text, 'stock'],
                               to_jsonb(floor((b.versions -> v_variant ->> 'stock')::numeric)::int + (it ->> 'quantity')::int))
                else b.versions end
          where b.id = it ->> 'book_id';
      end if;
    end loop;
    perform set_config('app.stock_reason', '', true);
    perform set_config('app.stock_ref', '', true);
    new.stock_restored := true;
  end if;
  return new;
end;
$function$;
