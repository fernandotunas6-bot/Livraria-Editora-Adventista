-- Campos repetidos das encomendas (2026-11-03). Promovida de docs/migracoes-pendentes a
-- 2026-11-04: o site publicado já lê por um só critério (612f83c, 4abbf61 estão no deploy),
-- e o workflow aplica as migrações antes de publicar a Edge Function — a ordem pedida.
-- Confirmado antes de promover: a definição de orders_before_update em produção é igual à
-- abaixo, tirando as duas mudanças pretendidas (local do passo e não reabrir canceladas).
--
--
-- O site e a Edge Function já lêem por um só critério (app/web/src/lib/orderUtils.js e
-- supabase/functions/app/orderFields.ts), com os campos actuais primeiro e os herdados para
-- as encomendas antigas. Esta migração faz duas coisas:
--
--  1. Preenche os campos actuais nas encomendas antigas, que só tinham os herdados:
--     o código e o nome do método de pagamento, a morada de entrega numa linha e a loja do
--     levantamento. Não apaga nada.
--  2. O trigger `orders_before_update` passa a tirar o local de cada passo do seguimento do
--     município da entrega ou da loja do levantamento, e já não de `city`; e recusa reabrir
--     uma encomenda cancelada (o stock já foi devolvido e não voltava a ser descontado).
--
-- Os updates não mudam estado, pagamento nem entrega, por isso o trigger de notificações
-- (`orders_notify_activity`, só `UPDATE OF status, payment_status, delivery_status`) não
-- avisa ninguém, e o `orders_before_update` não mexe na linha temporal, no total nem no stock.
-- Seguro de repetir: cada update só toca nas linhas onde o campo actual está vazio.
--
-- Ordem: publicar o site, depois esta migração, depois a Edge Function (que deixa de gravar
-- `payment_method` e `address`). Apagar as colunas herdadas fica para um passo seguinte,
-- descrito no README desta pasta.

-- 1a. Código do método de pagamento.
update public.orders
   set payment_method_code = payment_method
 where coalesce(payment_method_code, '') = '' and coalesce(payment_method, '') <> '';

-- 1b. Nome do método, como está hoje em Pagamentos (ou o nome dos dois métodos antigos).
update public.orders o
   set payment_method_name = coalesce(
     (select pm.name from public.payment_methods pm
       where pm.code = o.payment_method_code and coalesce(pm.name, '') <> ''
       order by pm.enabled desc, pm.sort_order limit 1),
     case o.payment_method_code
       when 'entrega' then 'Pagamento na entrega'
       when 'transferencia' then 'Transferência bancária'
       else o.payment_method_code
     end)
 where coalesce(o.payment_method_name, '') = '' and coalesce(o.payment_method_code, '') <> '';

-- 1c. Morada de entrega numa linha, nas entregas antigas.
update public.orders
   set delivery_address_full = concat_ws(', ', nullif(address, ''), nullif(city, ''))
 where coalesce(shipping_method, '') <> 'pickup'
   and coalesce(delivery_address_full, '') = ''
   and coalesce(address, '') <> '';

-- 1d. Loja do levantamento, nos levantamentos antigos (estava só em "Levantamento: …").
update public.orders
   set pickup_store = coalesce(nullif(regexp_replace(address, '^Levantamento:\s*', ''), ''), nullif(city, ''), '')
 where shipping_method = 'pickup' and coalesce(pickup_store, '') = '';

-- 2. Local dos passos do seguimento a partir dos campos actuais.
create or replace function public.orders_before_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  it jsonb;
  labels constant jsonb := '{"received":"Encomenda recebida","confirmed":"Encomenda confirmada","preparing":"A preparar envio","shipped":"Enviada","in_transit":"Em trânsito","out_for_delivery":"Saiu para entrega","delivered":"Entregue","cancelled":"Cancelada"}';
begin
  -- Uma encomenda cancelada já devolveu o stock (stock_restored). Reabri-la não o voltava a
  -- descontar e a loja ficava a vender livros que já tinham saído. Notas, tracking e
  -- pagamento continuam a poder ser actualizados; o estado é que não sai de "cancelada".
  if old.stock_restored and coalesce(new.status, '') <> 'cancelled' and coalesce(new.delivery_status, '') <> 'cancelled' then
    raise exception 'Encomenda cancelada: o stock já foi devolvido e não pode ser reaberta.';
  end if;

  if coalesce(new.delivery_status, '') <> '' and new.delivery_status is distinct from old.delivery_status then
    new.delivery_timeline := coalesce(new.delivery_timeline, '[]'::jsonb) || jsonb_build_array(jsonb_build_object(
      'status', new.delivery_status,
      'title', coalesce(labels ->> new.delivery_status, new.delivery_status),
      'description', '',
      -- Local do passo: o município da entrega ou a loja do levantamento. `city` fica só
      -- para as encomendas antigas.
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
        update public.stock_books
          set stock = coalesce(stock, 0) + (it ->> 'quantity')::int,
              sales_count = greatest(coalesce(sales_count, 0) - (it ->> 'quantity')::int, 0)
          where id = it ->> 'book_id';
      end if;
    end loop;
    perform set_config('app.stock_reason', '', true);
    perform set_config('app.stock_ref', '', true);
    new.stock_restored := true;
  end if;
  return new;
end;
$$;

revoke all on function public.orders_before_update() from public, anon, authenticated;
