-- Edições digitais à venda sem entrega nem levantamento.
--
-- Pedido do dono (2026-11-08), a fase seguinte dos livros digitais (20261108160000): vender a
-- edição digital "como os outros sistemas fazem". Nas lojas de livros digitais (Shopify,
-- WooCommerce, Kobo, Gumroad) um produto digital não tem stock nem envio: o checkout não pede
-- morada nem levantamento, não há portes, e a encomenda fica concluída quando o pagamento é
-- confirmado, que é quando o livro abre.
--
--   1. Produto digital: `stock_books.digital` (um produto sem variantes, por exemplo uma revista
--      em PDF) ou `"digital": true` numa variante (a "Edição digital" de um livro que também tem a
--      impressa). A regra está numa só função: private.item_digital(produto, variante).
--   2. place_order:
--        * o artigo digital não tem stock: não se verifica nem se desconta (conta nas vendas);
--        * entra com quantidade 1: o livro fica na conta de quem o compra;
--        * precisa de conta (customer_id): é na conta que o livro abre e que o acesso se fecha;
--        * precisa do PDF publicado (um material pago ligado ao produto ou à variante): ninguém
--          paga um livro que ainda não tem ficheiro;
--        * quem já o tem pago na biblioteca não o compra outra vez;
--        * só digitais: envio 'digital', sem portes, sem morada nem loja; com impressos à mistura,
--          os portes (e o limite dos portes grátis) contam só os impressos.
--   3. Encomenda 'digital': quando fica paga, fica entregue (o livro já está na biblioteca) e o
--      estado geral passa a concluída. Se o pagamento deixar de estar confirmado (anulado), volta
--      a esperar pelo pagamento. Não tem passos de envio: preparar, enviar ou entregar à mão é
--      recusado (a entrega é o pagamento confirmado).
--   4. Cancelar uma encomenda não devolve ao stock os artigos digitais: não saíram dele.
--   5. Métodos de pagamento: "Disponível para" aceita 'digital'. A regra de quais servem fica na
--      Edge Function (checkoutRules.ts) e no site (lib/paymentMethods.js).
--   6. Avisos: a equipa dos pagamentos recebe "Nova encomenda digital" (há um pagamento a
--      confirmar, nada a preparar); o cliente não recebe os avisos de entrega de uma encomenda
--      digital: recebe o do pagamento e o "Livro digital disponível" (20261108160000).
--   7. Um produto só digital não fica "Esgotado" no painel por não ter stock.
--
-- Reverter: repor public.place_order de 20261107201000, public.orders_before_update e
-- private.notify_order_activity de 20261107200000 e a regra payment_methods_shipping_methods_check
-- de 20261106050000; drop dos gatilhos orders_0_pagamento_digital e stock_books_edicao_digital,
-- das funções private.version_digital, private.item_digital, private.product_only_digital,
-- private.orders_digital_progress e private.stock_books_digital_stock, e da coluna
-- stock_books.digital.

-- ---------------------------------------------------------------------------
-- 1. O que é digital
-- ---------------------------------------------------------------------------
alter table public.stock_books add column if not exists digital boolean not null default false;
comment on column public.stock_books.digital is
  'Produto digital (PDF), sem stock nem envio: vale para o produto sem variantes. Com variantes, '
  'cada uma diz se é digital ("digital": true em versions). Abre com a encomenda paga '
  '(migrações livros_digitais e edicoes_digitais).';

-- Uma variante (um elemento de `versions`) é a edição digital?
create or replace function private.version_digital(p_version jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select jsonb_typeof(p_version) = 'object'
     and lower(btrim(coalesce(p_version ->> 'digital', ''))) in ('true', 't', '1', 'yes', 'sim');
$$;

-- Este produto, nesta variante, é digital? Com variantes decide a variante; sem variantes, o
-- produto. A mesma regra está em app/web/src/lib/digitalEditions.js (`isDigitalEdition`).
create or replace function private.item_digital(p_book public.stock_books, p_variant int)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select case
    when jsonb_typeof(p_book.versions) = 'array' and jsonb_array_length(p_book.versions) > 0 then
      p_variant is not null and p_variant >= 0 and p_variant < jsonb_array_length(p_book.versions)
      and private.version_digital(p_book.versions -> p_variant)
    else p_variant is null and coalesce(p_book.digital, false)
  end;
$$;

-- Tudo o que o produto vende é digital (não há nada para ter em stock)?
create or replace function private.product_only_digital(p_book public.stock_books)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select case
    when jsonb_typeof(p_book.versions) = 'array' and jsonb_array_length(p_book.versions) > 0 then
      not exists (select 1 from jsonb_array_elements(p_book.versions) v where not private.version_digital(v))
    else coalesce(p_book.digital, false)
  end;
$$;

revoke all on function private.version_digital(jsonb) from public;
revoke all on function private.item_digital(public.stock_books, int) from public;
revoke all on function private.product_only_digital(public.stock_books) from public;
grant execute on function private.version_digital(jsonb) to anon, authenticated, service_role;
grant execute on function private.item_digital(public.stock_books, int) to anon, authenticated, service_role;
grant execute on function private.product_only_digital(public.stock_books) to anon, authenticated, service_role;

-- Um produto só digital não tem stock, e não é por isso que está esgotado. Corre depois do
-- stock_books_before_save (que marca o esgotado pelo stock), pela ordem dos nomes.
create or replace function private.stock_books_digital_stock()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if private.product_only_digital(new) then
    new.stock_alert := false;
    new.stock_low := false;
  end if;
  return new;
end;
$$;
revoke all on function private.stock_books_digital_stock() from public, anon, authenticated;

drop trigger if exists stock_books_edicao_digital on public.stock_books;
create trigger stock_books_edicao_digital
  before insert or update on public.stock_books
  for each row execute function private.stock_books_digital_stock();

-- ---------------------------------------------------------------------------
-- 2. Métodos de pagamento: "Disponível para" aceita a edição digital
-- ---------------------------------------------------------------------------
alter table public.payment_methods drop constraint if exists payment_methods_shipping_methods_check;
alter table public.payment_methods
  add constraint payment_methods_shipping_methods_check
  check (shipping_methods is null or shipping_methods <@ array['delivery', 'express', 'pickup', 'digital']::text[]);
comment on column public.payment_methods.shipping_methods is
  'Envios em que o método aparece no checkout (delivery, express, pickup, digital). Vazio: as '
  'entregas e o levantamento, e a edição digital só se for pago antes (transferência, Multicaixa '
  'Express) ou pelo gateway — ver supabase/functions/app/checkoutRules.ts.';

-- ---------------------------------------------------------------------------
-- 3. place_order
-- ---------------------------------------------------------------------------
-- Igual ao de 20261107201000, com os artigos digitais (ver o cabeçalho, ponto 2).
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

-- ---------------------------------------------------------------------------
-- 4. A encomenda digital conclui-se com o pagamento
-- ---------------------------------------------------------------------------
-- Corre depois do orders_0_pagamento (que calcula o pagamento) e antes do orders_a_estado_geral
-- (que tira o estado geral da entrega), pela ordem dos nomes.
create or replace function private.orders_digital_progress()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce(new.shipping_method, '') <> 'digital'
     or coalesce(new.status, '') = 'cancelled' or coalesce(new.delivery_status, '') = 'cancelled' then
    return new;
  end if;

  if (new.delivery_status is distinct from old.delivery_status
      and coalesce(new.delivery_status, '') in ('preparing', 'processing', 'shipped', 'in_transit', 'out_for_delivery', 'failed'))
     or (new.status is distinct from old.status and coalesce(new.status, '') = 'shipped') then
    raise exception 'Encomenda só digital: não tem envio. Fica concluída sozinha quando o pagamento é confirmado.';
  end if;

  if new.payment_status = 'paid' then
    -- Pago: o livro já está na biblioteca.
    new.delivery_status := 'delivered';
  elsif coalesce(new.payment_status, '') <> 'refunded' and new.delivery_status = 'delivered' then
    if old.delivery_status is distinct from 'delivered' then
      raise exception 'Encomenda só digital: fica concluída sozinha quando o pagamento é confirmado.';
    end if;
    -- O pagamento deixou de estar confirmado (anulado): o livro fecha e a encomenda volta a
    -- esperar pelo pagamento.
    new.delivery_status := 'received';
    new.status := 'pending';
  end if;
  return new;
end;
$$;
revoke all on function private.orders_digital_progress() from public, anon, authenticated;

drop trigger if exists orders_0_pagamento_digital on public.orders;
create trigger orders_0_pagamento_digital
  before update on public.orders
  for each row execute function private.orders_digital_progress();

-- ---------------------------------------------------------------------------
-- 5. Linha do tempo e stock devolvido
-- ---------------------------------------------------------------------------
-- Igual ao de 20261107200000, com duas mudanças: os passos de uma encomenda digital dizem o que
-- se passa com o livro, e o cancelamento não devolve ao stock os artigos digitais (as vendas
-- descontam-se na mesma).
create or replace function public.orders_before_update()
 returns trigger
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  it jsonb;
  v_variant int;
  v_digital boolean;
  v_title text;
  v_description text;
  labels constant jsonb := '{"received":"Encomenda recebida","confirmed":"Encomenda confirmada","preparing":"A preparar envio","shipped":"Enviada","in_transit":"Em trânsito","out_for_delivery":"Saiu para entrega","delivered":"Entregue","cancelled":"Cancelada"}';
begin
  if old.stock_restored and coalesce(new.status, '') <> 'cancelled' and coalesce(new.delivery_status, '') <> 'cancelled' then
    raise exception 'Encomenda cancelada: o stock já foi devolvido e não pode ser reaberta.';
  end if;

  if coalesce(new.delivery_status, '') <> '' and new.delivery_status is distinct from old.delivery_status then
    v_title := coalesce(labels ->> new.delivery_status, new.delivery_status);
    v_description := '';
    if coalesce(new.shipping_method, '') = 'digital' then
      if new.delivery_status = 'delivered' then
        v_title := 'Na biblioteca';
        v_description := 'Pagamento confirmado: a edição digital está na biblioteca da conta.';
      elsif new.delivery_status = 'received' and old.delivery_status = 'delivered' then
        v_title := 'A aguardar o pagamento';
        v_description := 'O pagamento deixou de estar confirmado: a edição digital fecha até ser confirmado.';
      end if;
    end if;
    new.delivery_timeline := coalesce(new.delivery_timeline, '[]'::jsonb) || jsonb_build_array(jsonb_build_object(
      'status', new.delivery_status,
      'title', v_title,
      'description', v_description,
      'location', case when coalesce(new.shipping_method, '') = 'digital' then ''
                       else coalesce(nullif(new.delivery_municipality, ''), nullif(new.pickup_store, ''), new.city, '') end,
      'at', to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
    ));
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
        v_digital := coalesce(it ->> 'digital', '') = 'true';
        update public.stock_books b
          set stock = case when v_digital then b.stock else coalesce(b.stock, 0) + (it ->> 'quantity')::int end,
              sales_count = greatest(coalesce(b.sales_count, 0) - (it ->> 'quantity')::int, 0),
              versions = case
                when not v_digital and v_variant is not null and jsonb_typeof(b.versions) = 'array' and v_variant < jsonb_array_length(b.versions)
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

-- ---------------------------------------------------------------------------
-- 6. Avisos
-- ---------------------------------------------------------------------------
-- Igual ao de 20261107200000, com a encomenda digital: o cliente sabe logo como abre o livro, a
-- equipa dos pagamentos recebe a encomenda (não a de preparação: não há nada a preparar), e os
-- avisos de entrega não saem (o "Livro digital disponível" e o do pagamento dizem tudo).
create or replace function private.notify_order_activity()
 returns trigger
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_number text;
  v_label text;
  v_title text;
  v_store text;
  v_where text;
  v_digital boolean := coalesce(new.shipping_method, '') = 'digital';
begin
  if tg_op = 'INSERT' then
    v_number := left(coalesce(nullif(new.order_number, ''), new.id), 400);
    if new.customer_id is not null then
      insert into public.customer_notifications (customer_id, kind, title, body, href, order_id)
      values (new.customer_id, 'order', 'Encomenda recebida',
        case when v_digital
          then 'A encomenda ' || v_number || ' foi registada. A edição digital abre na sua biblioteca assim que o pagamento for confirmado.'
          else 'A encomenda ' || v_number || ' foi registada. Vamos avisá-lo de cada passo.' end,
        '/profile?tab=orders', new.id);
    end if;
    if v_digital then
      perform private.notify_staff(
        'payment', null, 'new_order',
        'Nova encomenda digital ' || v_number,
        'Edição digital, sem envio · ' || coalesce(nullif(new.customer_name, ''), 'Cliente') || ' · ' || private.kz(new.total)
          || ' · abre ao confirmar o pagamento',
        new.id, null, 'normal'
      );
      return new;
    end if;
    v_store := private.order_store_id(new.shipping_method, new.pickup_store);
    v_where := case
      when new.shipping_method = 'pickup' then 'Levantamento: ' || coalesce(nullif(new.pickup_store, ''), 'loja')
      when new.shipping_method = 'express' then 'Entrega expressa'
      else 'Entrega ao domicílio' end;
    perform private.notify_staff(
      'new_order', v_store, 'new_order',
      'Nova encomenda ' || v_number || ' — assumir',
      v_where || ' · ' || coalesce(nullif(new.customer_name, ''), 'Cliente') || ' · ' || private.kz(new.total),
      new.id, null, 'high'
    );
    return new;
  end if;

  if new.customer_id is null then return new; end if;
  v_number := left(coalesce(nullif(new.order_number, ''), new.id), 400);

  if new.status is distinct from old.status and new.status = 'cancelled' then
    insert into public.customer_notifications (customer_id, kind, title, body, href, order_id)
    values (new.customer_id, 'order', 'Encomenda cancelada',
      'A encomenda ' || v_number || ' foi cancelada. Se tiver dúvidas, fale connosco.', '/profile?tab=orders', new.id);
  end if;

  if new.payment_status is distinct from old.payment_status then
    v_label := case new.payment_status
      when 'pending' then 'pendente'
      when 'awaiting_confirmation' then 'a aguardar confirmação'
      when 'partially_paid' then 'pago em parte'
      when 'paid' then 'confirmado'
      when 'failed' then 'não confirmado'
      when 'refunded' then 'devolvido'
      else coalesce(nullif(new.payment_status, ''), 'pendente') end;
    insert into public.customer_notifications (customer_id, kind, title, body, href, order_id)
    values (new.customer_id, 'payment',
      case new.payment_status
        when 'paid' then 'Pagamento confirmado'
        when 'partially_paid' then 'Pagamento recebido em parte'
        when 'failed' then 'Pagamento não confirmado'
        else 'Pagamento: ' || v_label end,
      case new.payment_status
        when 'partially_paid' then 'Recebemos ' || private.kz(new.amount_paid) || ' da encomenda ' || v_number
          || '. Faltam ' || private.kz(greatest(new.total - new.amount_paid, 0)) || '.'
        when 'failed' then 'Não encontrámos o pagamento da encomenda ' || v_number
          || '. Veja o motivo na página da encomenda e indique outra referência.'
        else 'O pagamento da encomenda ' || v_number || ' está agora: ' || v_label || '.' end,
      '/profile?tab=orders', new.id);
  end if;

  if not v_digital and new.delivery_status is distinct from old.delivery_status and coalesce(new.delivery_status, '') not in ('', 'cancelled') then
    select t.title, t.body into v_title, v_label from (values
      ('received', 'Encomenda recebida', 'foi registada'),
      ('confirmed', 'Encomenda confirmada', 'está confirmada e na fila de preparação'),
      ('preparing', 'A preparar a sua encomenda', 'está a ser separada e embalada'),
      ('processing', 'A preparar a sua encomenda', 'está a ser separada e embalada'),
      ('shipped', case when new.shipping_method = 'pickup' then 'Pronta para levantamento' else 'Encomenda expedida' end,
                  case when new.shipping_method = 'pickup' then 'está pronta para levantar na loja' else 'já saiu da nossa loja' end),
      ('in_transit', 'Encomenda em trânsito', 'está a caminho'),
      ('out_for_delivery', 'Saiu para entrega', 'saiu para entrega e deve chegar hoje'),
      ('delivered', 'Encomenda entregue', 'foi entregue. Obrigado pela sua compra!'),
      ('failed', 'Ocorrência na entrega', 'teve uma ocorrência na entrega. Vamos contactá-lo')
    ) as t(status, title, body)
    where t.status = new.delivery_status;
    insert into public.customer_notifications (customer_id, kind, title, body, href, order_id)
    values (new.customer_id, 'delivery', coalesce(v_title, 'Estado da entrega actualizado'),
      'A encomenda ' || v_number || ' ' || coalesce(v_label, 'mudou de estado: ' || new.delivery_status) || '.',
      '/profile?tab=orders', new.id);
  end if;
  return new;
end;
$function$;
