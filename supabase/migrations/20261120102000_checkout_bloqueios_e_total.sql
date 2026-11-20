-- Checkout: bloqueios por ordem fixa e o total que o cliente viu.
--
-- Achados da análise crítica de 2026-11-20:
--   1. Bloqueio mútuo. O place_order bloqueava cada produto pela ordem do carrinho. Duas compras
--      simultâneas com os mesmos livros em ordem inversa bloqueavam-se uma à outra, e o Postgres
--      abortava uma («deadlock detected»): o cliente via «erro inesperado». Agora os produtos são
--      bloqueados todos de uma vez, por ordem do id, antes do ciclo.
--   2. Um preço mostrado, outro cobrado. As regras do preço vivem aqui e em app/web/src/lib/
--      pricing.js (o carrinho), e os portes vêm das definições que o site guarda em cache. Se
--      divergirem, a encomenda era gravada com outro total sem o cliente saber. Agora o site manda
--      o total que mostrou (`p_shipping.expected_total`); se o daqui for diferente, a compra pára
--      com o valor certo (P0001, hint `total_changed:<total>`), a Edge Function responde 409 e o
--      carrinho pede confirmação. Sem `expected_total` (apps antigas), tudo como antes.
--
-- O resto é igual a 20261108210000_edicoes_digitais.
--
-- Reverter: repor public.place_order de 20261108210000.

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
  v_price numeric;
  v_subtotal numeric := 0;
  v_physical numeric := 0;
  v_ship numeric := 0;
  v_items jsonb := '[]'::jsonb;
  v_method text := coalesce(nullif(p_shipping ->> 'method', ''), 'delivery');
  v_free numeric := coalesce((p_shipping ->> 'free_threshold')::numeric, 20000);
  v_std numeric := coalesce((p_shipping ->> 'cost')::numeric, 1500);
  v_exp numeric := coalesce((p_shipping ->> 'express_cost')::numeric, 0);
  v_payload jsonb;
  v_cols text;
  v_order jsonb;
  v_variant int;
  v_version jsonb;
  v_vlabel text;
  v_vstock int;
  v_vlist numeric;
  v_vsale numeric;
  v_own_price boolean;
  v_window boolean;
  v_digital boolean;
  v_lines int := 0;
  v_digitals int := 0;
  v_seen text[] := array[]::text[];
  v_customer uuid := nullif(btrim(coalesce(p_order ->> 'customer_id', '')), '')::uuid;
  v_owned text;
begin
  perform set_config('app.stock_reason', 'venda', true);
  perform set_config('app.stock_ref', coalesce(p_order ->> 'order_number', ''), true);

  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Carrinho vazio.';
  end if;

  -- Todos os produtos do carrinho bloqueados de uma vez, por ordem do id, antes do ciclo: duas
  -- compras com os mesmos livros em ordens diferentes bloqueavam-nos cruzados (A depois B, B depois
  -- A) e o Postgres abortava uma delas com «deadlock detected», que o cliente via como erro.
  perform 1 from public.stock_books b
  where b.id in (select distinct x ->> 'book_id' from jsonb_array_elements(p_items) x)
  order by b.id
  for update;

  for it in select * from jsonb_array_elements(p_items) loop
    v_qty := least(greatest(coalesce((it ->> 'quantity')::int, 1), 1), 99);
    select * into v_book from public.stock_books where id = it ->> 'book_id' for update;
    if not found then raise exception 'Produto não encontrado.'; end if;
    if not coalesce(v_book.active, true) then raise exception 'Produto indisponível: %', v_book.title; end if;

    v_variant := nullif(it ->> 'variant', '')::int;
    v_version := null;
    v_vlabel := '';
    v_vlist := null;
    v_vsale := null;
    if v_variant is not null and jsonb_typeof(v_book.versions) = 'array' and v_variant >= 0 and v_variant < jsonb_array_length(v_book.versions) then
      v_version := v_book.versions -> v_variant;
      v_vlabel := btrim(concat_ws(' · ', nullif(btrim(v_version ->> 'label'), ''), nullif(btrim(v_version ->> 'format'), '')));
    elsif v_variant is not null then
      raise exception 'Variante indisponível para: %', v_book.title;
    elsif jsonb_typeof(v_book.versions) = 'array' and jsonb_array_length(v_book.versions) > 0 then
      -- Produto com tamanhos ou edições e nenhum escolhido: sem isto, um uniforme comprado no
      -- cartão da loja entrava sem tamanho, ao preço base e só com o stock geral.
      raise exception 'Escolha o tamanho ou a edição de: %', v_book.title;
    end if;

    v_lines := v_lines + 1;
    v_digital := private.item_digital(v_book, v_variant);
    v_vstock := null;
    if v_digital then
      -- Edição digital: sem stock, uma por conta, com o ficheiro já publicado.
      v_digitals := v_digitals + 1;
      v_qty := 1;
      if (v_book.id || ':' || coalesce(v_variant::text, '')) = any (v_seen) then
        raise exception 'A edição digital de % está repetida no carrinho.', v_book.title;
      end if;
      v_seen := v_seen || (v_book.id || ':' || coalesce(v_variant::text, ''));
      if v_customer is null then
        raise exception 'Entre na sua conta para comprar a edição digital de %: é na conta que o livro fica.', v_book.title;
      end if;
      if not exists (
        select 1 from public.downloads d
        where d.access = 'paid' and d.published and coalesce(d.file_path, '') <> ''
          and d.book_id = v_book.id and (d.variant is null or d.variant = v_variant)
      ) then
        raise exception 'A edição digital de % ainda não está disponível.', v_book.title;
      end if;
      select coalesce(nullif(o.order_number, ''), o.id) into v_owned
      from public.orders o
      where private.order_belongs_to(o, v_customer)
        and private.order_unlocks(o)
        and private.order_has_item(o.items, v_book.id, v_variant)
      limit 1;
      if v_owned is not null then
        raise exception 'Já comprou a edição digital de % (encomenda %): está na sua biblioteca.', v_book.title, v_owned;
      end if;
    else
      if coalesce(v_book.stock, 0) < v_qty then raise exception 'Stock insuficiente para: %', v_book.title; end if;
      if v_version is not null and coalesce(v_version ->> 'stock', '') ~ '^\s*-?\d+(\.\d+)?\s*$' then
        v_vstock := floor((v_version ->> 'stock')::numeric)::int;
        if v_vstock < v_qty then raise exception 'Stock insuficiente para: % (%)', v_book.title, v_vlabel; end if;
      end if;
    end if;

    -- Preço em vigor. No produto manda o `public.effective_price`: o promocional só conta se for
    -- MENOR que o de tabela e se a janela `sale_starts_at`/`sale_ends_at` estiver aberta.
    -- Na variante:
    --   * com preço próprio, vale o dela, e o promocional dela nas mesmas duas condições (as
    --     variantes não têm datas: usam a janela do produto);
    --   * sem preço próprio (vazio, 0 ou ausente), é o produto: preço e promoção do produto.
    -- A mesma regra está em `app/web/src/lib/pricing.js` (`variantPrices`), que é o que o
    -- carrinho mostra — mexer num sítio sem mexer no outro põe o site a mostrar um preço e o
    -- servidor a cobrar outro.
    v_price := public.effective_price(v_book)::numeric;
    if v_version is not null then
      v_vlist := nullif(regexp_replace(coalesce(v_version ->> 'price', ''), '[^0-9.]', '', 'g'), '')::numeric;
      v_vsale := nullif(regexp_replace(coalesce(v_version ->> 'sale_price', ''), '[^0-9.]', '', 'g'), '')::numeric;
      v_own_price := coalesce(v_vlist, 0) > 0;
      if not v_own_price then v_vlist := v_book.price::numeric; end if;
      v_window := (v_book.sale_starts_at is null or v_book.sale_starts_at <= now())
              and (v_book.sale_ends_at is null or v_book.sale_ends_at > now());
      if coalesce(v_vsale, 0) > 0 and v_vsale < coalesce(v_vlist, 0) and v_window then
        v_price := v_vsale;
      elsif v_own_price then
        v_price := v_vlist;
      end if;
    end if;
    if coalesce(v_price, 0) <= 0 then raise exception 'Preço inválido para: %', v_book.title; end if;
    v_price := round(v_price, 2);

    v_subtotal := v_subtotal + v_price * v_qty;
    if not v_digital then v_physical := v_physical + v_price * v_qty; end if;
    v_items := v_items || jsonb_build_array(jsonb_strip_nulls(jsonb_build_object(
      'book_id', v_book.id, 'title', v_book.title, 'book_code', coalesce(v_book.book_code, ''),
      'product_type', coalesce(v_book.product_type, 'livro'),
      'variant', v_variant, 'variant_label', nullif(v_vlabel, ''),
      'quantity', v_qty, 'price', v_price, 'list_price', round(coalesce(v_vlist, v_book.price::numeric), 2),
      'digital', case when v_digital then true end
    )));
    update public.stock_books
      set stock = case when v_digital then stock else coalesce(stock, 0) - v_qty end,
          sales_count = coalesce(sales_count, 0) + v_qty,
          versions = case when v_vstock is not null
            then jsonb_set(versions, array[v_variant::text, 'stock'], to_jsonb(v_vstock - v_qty))
            else versions end
      where id = v_book.id;
  end loop;

  -- Só edições digitais: não há envio. Com impressos, o envio é o deles.
  if v_digitals = v_lines then
    v_method := 'digital';
  elsif v_method = 'digital' then
    raise exception 'Os produtos impressos precisam de entrega ou levantamento: escolha como os quer receber.';
  end if;

  -- Os portes (e o limite dos portes grátis) contam só o que se envia.
  if v_exp <= 0 then v_exp := v_std * 2; end if;
  if v_method in ('pickup', 'digital') then v_ship := 0;
  elsif v_method = 'express' then v_ship := greatest(v_exp, 0);
  elsif v_physical >= v_free then v_ship := 0;
  else v_ship := greatest(v_std, 0);
  end if;

  -- O total que o cliente viu no carrinho (opcional): o preço, a promoção e os portes calculados
  -- aqui são os que contam, e se não baterem certo com o que lhe foi mostrado a compra pára, em vez
  -- de gravar outro valor. A Edge Function devolve-lhe o total certo para confirmar (409).
  if coalesce(p_shipping ->> 'expected_total', '') ~ '^\s*\d+(\.\d+)?\s*$'
     and abs(round(v_subtotal + v_ship, 2) - round((p_shipping ->> 'expected_total')::numeric, 2)) >= 0.01 then
    raise exception 'O total desta compra é % e não % como aparecia no carrinho. Confirme outra vez com o valor certo.',
      private.kz(round(v_subtotal + v_ship, 2)), private.kz(round((p_shipping ->> 'expected_total')::numeric, 2))
      using errcode = 'P0001', hint = 'total_changed:' || round(v_subtotal + v_ship, 2)::text;
  end if;

  v_payload := p_order || jsonb_build_object(
    'id', public.gen_record_id(),
    'items', v_items,
    'shipping_cost', round(v_ship, 2),
    'total', round(v_subtotal + v_ship, 2)
  );
  if v_method = 'digital' then
    -- Sem envio: nem morada, nem loja, nem coordenadas, nem data de entrega.
    v_payload := (v_payload - array[
        'delivery_province_id', 'delivery_province', 'delivery_municipality_id', 'delivery_municipality',
        'delivery_locality_id', 'delivery_locality', 'delivery_street', 'delivery_reference', 'delivery_address_full',
        'delivery_relative_name', 'delivery_relative_phone', 'delivery_gps_lat', 'delivery_gps_lng',
        'address', 'estimated_delivery'])
      || jsonb_build_object('shipping_method', 'digital', 'pickup_store', '');
  end if;

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
