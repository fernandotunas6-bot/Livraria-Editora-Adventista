-- Tamanhos sem preço próprio e comissões dos colportores que acompanham o pagamento.
--
-- 1. Tamanho (ou edição) sem preço próprio é o produto, com a promoção do produto.
--    O painel grava `price: ''` num tamanho a que não se deu preço. O site lia isso como 0 Kz e o
--    `place_order` cobrava o preço de tabela do produto, sem a promoção que o cartão da loja
--    anunciava. Agora os dois lados dizem o mesmo: sem preço próprio, vale o preço em vigor do
--    produto (`public.effective_price`, com a janela da promoção); com preço próprio, vale o dele
--    e o promocional dele. A mesma regra está em app/web/src/lib/pricing.js (`variantPrices`).
--    O resto do `place_order` é igual ao de 20261106170000, com o dinheiro em numeric.
--
-- 2. A comissão de uma venda no site é acertada pela diferença. A encomenda deve agora a
--    comissão inteira se estiver paga, entregue e não cancelada, e zero em qualquer outro caso;
--    o que já está na conta corrente para essa encomenda (comissões e anulações) é somado, e entra
--    só a diferença. Antes:
--      * um pagamento que voltava de "pago" a "pendente" deixava a comissão na conta;
--      * uma encomenda reembolsada e depois paga outra vez nunca voltava a dar comissão, porque o
--        índice único (order_id, kind) só deixava uma comissão e uma anulação por encomenda.
--    O índice sai; a soma por encomenda passa a ser a regra. `colporteur_site_sales` passa a somar
--    as linhas da encomenda (com várias, a subconsulta de uma só linha rebentava).
--
-- Reverter: repor place_order de 20261106170000, orders_colportor_comissao e
-- colporteur_site_sales de 20261107103000 e o índice colporteur_ledger_uma_por_encomenda.

-- ---------------------------------------------------------------------------
-- 1. place_order
-- ---------------------------------------------------------------------------
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
  v_ship numeric := 0;
  v_items jsonb := '[]'::jsonb;
  v_method text := coalesce(p_shipping ->> 'method', 'delivery');
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
    elsif jsonb_typeof(v_book.versions) = 'array' and jsonb_array_length(v_book.versions) > 0 then
      -- Produto com tamanhos ou edições e nenhum escolhido: sem isto, um uniforme comprado no
      -- cartão da loja entrava sem tamanho, ao preço base e só com o stock geral.
      raise exception 'Escolha o tamanho ou a edição de: %', v_book.title;
    end if;

    if coalesce(v_book.stock, 0) < v_qty then raise exception 'Stock insuficiente para: %', v_book.title; end if;
    if v_version is not null and coalesce(v_version ->> 'stock', '') ~ '^\s*-?\d+(\.\d+)?\s*$' then
      v_vstock := floor((v_version ->> 'stock')::numeric)::int;
      if v_vstock < v_qty then raise exception 'Stock insuficiente para: % (%)', v_book.title, v_vlabel; end if;
    else
      v_vstock := null;
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
    v_items := v_items || jsonb_build_array(jsonb_strip_nulls(jsonb_build_object(
      'book_id', v_book.id, 'title', v_book.title, 'book_code', coalesce(v_book.book_code, ''),
      'product_type', coalesce(v_book.product_type, 'livro'),
      'variant', v_variant, 'variant_label', nullif(v_vlabel, ''),
      'quantity', v_qty, 'price', v_price, 'list_price', round(coalesce(v_vlist, v_book.price::numeric), 2)
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
    'shipping_cost', round(v_ship, 2),
    'total', round(v_subtotal + v_ship, 2)
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

-- ---------------------------------------------------------------------------
-- 2. Comissões das vendas no site, acertadas pela diferença
-- ---------------------------------------------------------------------------
drop index if exists public.colporteur_ledger_uma_por_encomenda;
create index if not exists colporteur_ledger_order_idx on public.colporteur_ledger (order_id) where order_id is not null;

create or replace function private.orders_colportor_comissao()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_due numeric := 0;
  v_booked numeric;
  v_ref text;
  v_reason text;
begin
  if new.colporteur_id is null then return new; end if;
  -- Fechada: paga (um reembolso parcial deixa-a paga), entregue e não cancelada.
  if new.payment_status = 'paid' and new.delivery_status = 'delivered' and coalesce(new.status, '') <> 'cancelled' then
    v_due := private.colporteur_order_commission(new);
  end if;
  -- O que já está na conta por esta encomenda: comissões (negativas) e anulações (positivas).
  select coalesce(-sum(amount), 0) into v_booked
  from public.colporteur_ledger
  where order_id = new.id and colporteur_id = new.colporteur_id and kind in ('comissao', 'ajuste');
  if v_due = v_booked then return new; end if;

  v_ref := coalesce(nullif(new.order_number, ''), new.id);
  if v_due > v_booked then
    insert into public.colporteur_ledger (colporteur_id, kind, amount, description, order_id, actor)
    values (new.colporteur_id, 'comissao', -(v_due - v_booked),
            case when v_booked = 0 and not exists (select 1 from public.colporteur_ledger where order_id = new.id)
                 then 'Venda no site · ' || v_ref else 'Comissão reposta · ' || v_ref end,
            new.id, auth.uid());
  else
    v_reason := case
      when coalesce(new.status, '') = 'cancelled' or new.delivery_status = 'cancelled' then 'cancelada'
      when new.payment_status = 'refunded' then 'reembolsada'
      when new.delivery_status is distinct from 'delivered' then 'deixou de estar entregue'
      else 'pagamento por confirmar' end;
    insert into public.colporteur_ledger (colporteur_id, kind, amount, description, order_id, actor)
    values (new.colporteur_id, 'ajuste', v_booked - v_due,
            'Anulação da comissão · ' || v_ref || ' (' || v_reason || ')', new.id, auth.uid());
  end if;
  return new;
end;
$$;
revoke all on function private.orders_colportor_comissao() from public, anon, authenticated;

-- Vendas no site de um colportor: como em 20261107103000, com a comissão somada por encomenda.
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
      'commission', coalesce((select -sum(l.amount) from public.colporteur_ledger l
                              where l.order_id = o.id and l.kind in ('comissao', 'ajuste')), 0),
      'cancelled_commission', exists (select 1 from public.colporteur_ledger l where l.order_id = o.id and l.kind = 'ajuste')
                              and coalesce((select -sum(l.amount) from public.colporteur_ledger l
                                            where l.order_id = o.id and l.kind in ('comissao', 'ajuste')), 0) = 0,
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
