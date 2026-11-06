-- Promoções das variantes com as mesmas regras das do produto.
--
-- `public.effective_price` (produto) exige duas coisas ao preço promocional: ser menor que o
-- preço de tabela e estar dentro da janela `sale_starts_at`/`sale_ends_at`. O caminho das
-- variantes não exigia nenhuma das duas — aplicava `versions[i].sale_price` tal como estava.
-- Consequências, as duas vistas na revisão de 2026-11-06:
--
--   * uma promoção agendada para o futuro já descontava nas variantes;
--   * um `sale_price` acima do preço da variante era cobrado como se fosse desconto, e o
--     recibo mostrava o preço verdadeiro riscado por baixo.
--
-- Esta migração mexe só no bloco do preço da variante e no `list_price` da linha. O resto do
-- `place_order` é igual ao da migração `variantes_nas_encomendas`.
--
-- O lado do site vai a `app/web/src/lib/pricing.js` (`variantPrices`), com testes; as duas
-- têm de concordar, porque é esta que cobra.
--
-- Reverter: voltar a aplicar a função da migração 20261105054638.

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
  v_vlist double precision;
  v_vsale double precision;
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
    v_vlist := null;
    v_vsale := null;
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

    -- Preço em vigor. No produto manda o `public.effective_price`: o promocional só conta
    -- se for MENOR que o de tabela e se a janela `sale_starts_at`/`sale_ends_at` estiver
    -- aberta. A variante passa a seguir as mesmas duas condições, com a janela do produto
    -- (as variantes não têm datas próprias: são campos de um elemento de `versions`).
    --
    -- Antes o `sale_price` da variante entrava sempre: uma promoção agendada para a semana
    -- seguinte já descontava, e um `sale_price` acima do preço da variante era cobrado como
    -- se fosse desconto. A mesma regra está em `app/web/src/lib/pricing.js`
    -- (`variantPrices`), que é o que o carrinho mostra — mexer num sítio sem mexer no outro
    -- põe o site a mostrar um preço e o servidor a cobrar outro.
    v_price := public.effective_price(v_book);
    if v_version is not null then
      v_vlist := nullif(regexp_replace(coalesce(v_version ->> 'price', ''), '[^0-9.]', '', 'g'), '')::double precision;
      if coalesce(v_vlist, 0) <= 0 then v_vlist := v_book.price; end if;
      v_vsale := nullif(regexp_replace(coalesce(v_version ->> 'sale_price', ''), '[^0-9.]', '', 'g'), '')::double precision;
      if coalesce(v_vsale, 0) > 0 and v_vsale < coalesce(v_vlist, 0)
         and (v_book.sale_starts_at is null or v_book.sale_starts_at <= now())
         and (v_book.sale_ends_at is null or v_book.sale_ends_at > now())
      then
        v_price := v_vsale;
      elsif coalesce(v_vlist, 0) > 0 then
        v_price := v_vlist;
      end if;
    end if;
    if coalesce(v_price, 0) <= 0 then raise exception 'Preço inválido para: %', v_book.title; end if;

    v_subtotal := v_subtotal + v_price * v_qty;
    v_items := v_items || jsonb_build_array(jsonb_strip_nulls(jsonb_build_object(
      'book_id', v_book.id, 'title', v_book.title, 'book_code', coalesce(v_book.book_code, ''),
      'product_type', coalesce(v_book.product_type, 'livro'),
      'variant', v_variant, 'variant_label', nullif(v_vlabel, ''),
      'quantity', v_qty, 'price', v_price, 'list_price', coalesce(v_vlist, v_book.price)
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
