-- "Compra verificada" nas avaliações só com uma compra a sério.
--
-- Antes bastava uma encomenda não cancelada com o livro, mesmo por pagar e nunca entregue: quem
-- encomendasse com "Pagar no Balcão" e nunca levantasse avaliava como "compra verificada". E a
-- marca só se calculava ao gravar a avaliação, por isso cancelar a encomenda depois não a tirava.
--
-- 1. A encomenda conta se não estiver cancelada e já tiver sido paga, entregue ou confirmada pelo
--    cliente. A mesma regra está no site (app/web/src/lib/purchase.js).
-- 2. Quando o estado de uma encomenda muda (pagamento, entrega, cancelamento), as avaliações desse
--    cliente para os livros dessa encomenda são recalculadas.

create or replace function public.book_reviews_before_save()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email text;
  v_name text;
  v_avatar text;
begin
  if tg_op = 'UPDATE' then
    new.book_id := old.book_id;
    new.user_id := old.user_id;
    new.created := old.created;
  end if;

  select lower(coalesce(nullif(u.email, ''), p.email, '')), coalesce(p.name, ''), coalesce(p.avatar, '')
    into v_email, v_name, v_avatar
  from auth.users u
  left join public.profiles p on p.id = u.id
  where u.id = new.user_id;

  new.user_name := left(coalesce(nullif(trim(v_name), ''), split_part(coalesce(v_email, ''), '@', 1), 'Leitor'), 100);
  new.user_avatar := coalesce(v_avatar, '');
  new.comment := trim(new.comment);
  new.is_verified := coalesce(v_email, '') <> '' and exists (
    select 1
    from public.orders o
    where lower(o.customer_email) = v_email
      and coalesce(o.status, '') not in ('cancelled', 'canceled', 'cancelada')
      and coalesce(o.delivery_status, '') <> 'cancelled'
      and (o.payment_status = 'paid' or o.delivery_status = 'delivered' or o.customer_confirmed_at is not null)
      and jsonb_typeof(o.items) = 'array'
      and o.items @> jsonb_build_array(jsonb_build_object('book_id', new.book_id))
  );
  new.updated := now();
  return new;
end;
$$;

-- Recalcula as avaliações do cliente quando a encomenda muda de estado. O update "vazio" dispara
-- o book_reviews_before_save, que volta a decidir o is_verified.
create or replace function public.orders_recalcula_compra_verificada()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status is distinct from old.status
     or new.payment_status is distinct from old.payment_status
     or new.delivery_status is distinct from old.delivery_status
     or new.customer_confirmed_at is distinct from old.customer_confirmed_at then
    update public.book_reviews r
    set comment = r.comment
    where r.user_id in (
        select u.id from auth.users u where lower(u.email) = lower(coalesce(new.customer_email, ''))
      )
      and r.book_id in (
        select it ->> 'book_id'
        from jsonb_array_elements(case when jsonb_typeof(new.items) = 'array' then new.items else '[]'::jsonb end) it
      );
  end if;
  return null;
end;
$$;

drop trigger if exists orders_recalcula_compra_verificada on public.orders;
create trigger orders_recalcula_compra_verificada
  after update on public.orders
  for each row execute function public.orders_recalcula_compra_verificada();

revoke all on function public.orders_recalcula_compra_verificada() from public, anon, authenticated;

-- Avaliações já gravadas com a regra antiga.
update public.book_reviews set comment = comment;
