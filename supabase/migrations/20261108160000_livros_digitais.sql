-- Livros digitais: só abrem pagos, a biblioteca do cliente e os acessos no painel.
--
-- Pedido do dono (2026-11-08): "cada livro digital só pode ser descarregado se for pago; painel de
-- abrir ligado ao pagamento; tudo bem organizado, como os outros sistemas fazem". Como fazem as
-- lojas de livros digitais (WooCommerce, Shopify Digital Downloads, Gumroad, Kobo): o acesso abre
-- quando o pagamento é confirmado e fecha com o reembolso; o cliente tem uma biblioteca com cada
-- compra e o seu estado; a equipa vê quem tem acesso a quê, com o pagamento ao lado, e pode
-- bloquear um acesso; cada download fica registado.
--
--   1. A regra muda: um PDF pago abre só com a encomenda PAGA (payment_status = 'paid', que resulta
--      dos pagamentos confirmados pelo gateway ou por quem tem "Confirmar pagamentos" — migração
--      pagamentos_registados). Antes também abria com a encomenda "entregue" ou com a recepção
--      confirmada pelo cliente: uma encomenda entregue e por pagar dava o livro.
--      Reembolsada (refunded), paga em parte, por confirmar ou cancelada: fechado.
--   2. A equipa (Catálogo ou Encomendas) pode bloquear o acesso de uma pessoa a um livro, com o
--      motivo (por exemplo, partilha do ficheiro), e desbloquear. Fica no registo de segurança.
--      Abrir sem pagamento não existe: "abrir" é confirmar o pagamento da encomenda.
--   3. Cada download ou abertura de um livro pago fica registado (download_events).
--   4. `my_digital_library()`: a biblioteca do cliente, com o estado de cada livro (por pagar,
--      pagamento por confirmar, pago em parte, disponível, reembolsado, bloqueado).
--   5. `digital_access_overview()`: o painel da equipa (Catálogo → Materiais → Acessos).
--   6. Quando uma encomenda com livros digitais fica paga, o cliente recebe o aviso na conta.
--
-- Reverter: repor private.bought_product, private.can_download e public.start_download de
-- 20261106200000/20261106230000; drop das tabelas download_blocks e download_events, das funções
-- my_digital_library, digital_access_overview, private.can_manage_digital,
-- private.order_unlocks e do gatilho orders_livros_digitais.

-- ---------------------------------------------------------------------------
-- 1. A regra: só pago
-- ---------------------------------------------------------------------------

-- A encomenda pertence a esta conta? Pelo customer_id, ou pelo email da conta só se estiver
-- confirmado (um email por confirmar não abre os livros de outra pessoa).
create or replace function private.order_belongs_to(p_order public.orders, p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_user is not null and (
    p_order.customer_id = p_user
    or lower(coalesce(p_order.customer_email, '')) = (
      select lower(u.email) from auth.users u
      where u.id = p_user and u.email_confirmed_at is not null and coalesce(u.email, '') <> ''
    )
  );
$$;

-- Os artigos da encomenda incluem este produto (e, se o material o pede, esta variante)?
create or replace function private.order_has_item(p_items jsonb, p_book_id text, p_variant int)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_book_id is not null and jsonb_typeof(p_items) = 'array' and p_items @> case
    when p_variant is null then jsonb_build_array(jsonb_build_object('book_id', p_book_id))
    else jsonb_build_array(jsonb_build_object('book_id', p_book_id, 'variant', p_variant))
  end;
$$;

-- Encomenda que conta para abrir: não cancelada e paga.
create or replace function private.order_unlocks(p_order public.orders)
returns boolean
language sql
stable
set search_path = ''
as $$
  select coalesce(p_order.status, '') not in ('cancelled', 'canceled', 'cancelada')
     and coalesce(p_order.delivery_status, '') <> 'cancelled'
     and p_order.payment_status = 'paid';
$$;

-- Quem tem sessão comprou e PAGOU este produto (ou esta variante)?
create or replace function private.bought_product(p_book_id text, p_variant int)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select auth.uid() is not null and p_book_id is not null and exists (
    select 1
    from public.orders o
    where private.order_belongs_to(o, auth.uid())
      and private.order_unlocks(o)
      and private.order_has_item(o.items, p_book_id, p_variant)
  );
$$;

revoke all on function private.order_belongs_to(public.orders, uuid) from public;
revoke all on function private.order_has_item(jsonb, text, int) from public;
revoke all on function private.order_unlocks(public.orders) from public;
revoke all on function private.bought_product(text, int) from public;
grant execute on function private.order_belongs_to(public.orders, uuid) to anon, authenticated, service_role;
grant execute on function private.order_has_item(jsonb, text, int) to anon, authenticated, service_role;
grant execute on function private.order_unlocks(public.orders) to anon, authenticated, service_role;
grant execute on function private.bought_product(text, int) to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 2. Bloqueios
-- ---------------------------------------------------------------------------

-- Quem gere os acessos: o catálogo (os livros) ou as encomendas (os compradores).
create or replace function private.can_manage_digital()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.has_permission('manage_catalog') or private.has_permission('manage_orders');
$$;
revoke all on function private.can_manage_digital() from public;
grant execute on function private.can_manage_digital() to anon, authenticated, service_role;

create table if not exists public.download_blocks (
  id uuid primary key default gen_random_uuid(),
  download_id text not null references public.downloads (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  reason text not null,
  blocked_by uuid references public.profiles (id) on delete set null,
  created timestamptz not null default now(),
  constraint download_blocks_reason_len check (char_length(btrim(reason)) between 3 and 300),
  constraint download_blocks_one unique (download_id, user_id)
);
create index if not exists download_blocks_user_idx on public.download_blocks (user_id);

create or replace function public.download_blocks_before_insert()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.reason := btrim(regexp_replace(coalesce(new.reason, ''), '\s+', ' ', 'g'));
  new.blocked_by := auth.uid();
  new.created := now();
  return new;
end;
$$;
revoke all on function public.download_blocks_before_insert() from public, anon, authenticated;
drop trigger if exists download_blocks_before_insert on public.download_blocks;
create trigger download_blocks_before_insert
  before insert on public.download_blocks
  for each row execute function public.download_blocks_before_insert();

alter table public.download_blocks enable row level security;
drop policy if exists "download_blocks: a equipa lê" on public.download_blocks;
create policy "download_blocks: a equipa lê" on public.download_blocks
  for select to authenticated using ((select private.can_manage_digital()));
drop policy if exists "download_blocks: a equipa bloqueia" on public.download_blocks;
create policy "download_blocks: a equipa bloqueia" on public.download_blocks
  for insert to authenticated with check ((select private.can_manage_digital()));
drop policy if exists "download_blocks: a equipa desbloqueia" on public.download_blocks;
create policy "download_blocks: a equipa desbloqueia" on public.download_blocks
  for delete to authenticated using ((select private.can_manage_digital()));
revoke all on public.download_blocks from anon, authenticated;
grant select, delete on public.download_blocks to authenticated;
grant insert (download_id, user_id, reason) on public.download_blocks to authenticated;

-- Registo de segurança: bloquear e desbloquear o acesso a um livro pago.
create or replace function private.audit_download_blocks()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.download_blocks := case when tg_op = 'DELETE' then old else new end;
  v_title text;
  v_email text;
begin
  select d.title into v_title from public.downloads d where d.id = v_row.download_id;
  select p.email into v_email from public.profiles p where p.id = v_row.user_id;
  perform private.audit_write(
    'download_blocks', v_row.id::text, lower(tg_op),
    left(case when tg_op = 'DELETE' then 'Acesso desbloqueado: ' else 'Acesso bloqueado: ' end
      || coalesce(v_title, 'livro digital') || ' — ' || coalesce(nullif(v_email, ''), 'cliente'), 300),
    jsonb_build_object('motivo', v_row.reason, 'livro', v_row.download_id, 'cliente', v_row.user_id),
    false
  );
  return null;
end;
$$;
revoke execute on function private.audit_download_blocks() from public, anon, authenticated;
drop trigger if exists download_blocks_audit on public.download_blocks;
create trigger download_blocks_audit
  after insert or delete on public.download_blocks
  for each row execute function private.audit_download_blocks();

-- A regra de acesso (a vista, a função de download e o Storage passam por aqui): pago e sem bloqueio.
create or replace function private.can_download(p_id text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.downloads d
    where d.id = p_id
      and d.file_path <> ''
      and (
        private.has_permission('manage_catalog')
        or (d.published and (
          d.access = 'free'
          or (
            private.bought_product(d.book_id, d.variant)
            and not exists (
              select 1 from public.download_blocks b where b.download_id = d.id and b.user_id = auth.uid()
            )
          )
        ))
      )
  );
$$;
revoke all on function private.can_download(text) from public;
grant execute on function private.can_download(text) to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 3. Registo dos downloads (só dos livros pagos, de quem tem conta)
-- ---------------------------------------------------------------------------
create table if not exists public.download_events (
  id bigint generated always as identity primary key,
  download_id text not null references public.downloads (id) on delete cascade,
  user_id uuid references public.profiles (id) on delete set null,
  mode text not null default 'download',
  created timestamptz not null default now(),
  constraint download_events_mode check (mode in ('download', 'open'))
);
create index if not exists download_events_who_idx on public.download_events (download_id, user_id, created desc);
create index if not exists download_events_user_idx on public.download_events (user_id, created desc);
alter table public.download_events enable row level security;
-- Sem políticas: só as funções abaixo (security definer) lêem e escrevem.
revoke all on public.download_events from anon, authenticated;

-- A função de sempre, com o modo (abrir no navegador ou descarregar) e o registo.
drop function if exists public.start_download(text);
create or replace function public.start_download(p_id text, p_mode text default 'download')
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.downloads;
  v_client text := coalesce(auth.uid()::text, private.request_ip(), 'anonimo');
  v_mode text := case when p_mode = 'open' then 'open' else 'download' end;
begin
  select * into v from public.downloads where id = p_id;
  if not found or (not v.published and not private.has_permission('manage_catalog')) or v.file_path = '' then
    raise exception 'Este material já não está disponível.';
  end if;
  if not private.can_download(p_id) then
    if auth.uid() is null then
      raise exception 'Entre na sua conta para abrir o que comprou.';
    end if;
    if exists (select 1 from public.download_blocks b where b.download_id = p_id and b.user_id = auth.uid()) then
      raise exception 'O acesso a este livro foi bloqueado pela loja. Fale connosco para saber mais.';
    end if;
    raise exception 'Este livro abre quando o pagamento da encomenda estiver confirmado.';
  end if;
  if not private.check_rate_limit('download', v_client, 30, interval '1 hour') then
    raise exception 'Muitos downloads seguidos. Tente daqui a pouco.';
  end if;

  perform set_config('app.download_count', 'on', true);
  update public.downloads set download_count = download_count + 1 where id = p_id;
  perform set_config('app.download_count', 'off', true);
  if v.access = 'paid' and auth.uid() is not null then
    insert into public.download_events (download_id, user_id, mode) values (p_id, auth.uid(), v_mode);
  end if;

  return jsonb_build_object(
    'path', v.file_path,
    'file_name', coalesce(nullif(v.file_name, ''), 'material.pdf'),
    'mode', v_mode
  );
end;
$$;
revoke all on function public.start_download(text, text) from public;
grant execute on function public.start_download(text, text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4. A biblioteca do cliente
-- ---------------------------------------------------------------------------

-- Estado de um livro digital numa encomenda (o mesmo para o cliente e para a equipa).
create or replace function private.digital_state(p_payment text, p_blocked boolean, p_has_account boolean)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when p_blocked then 'blocked'
    when p_payment = 'refunded' then 'refunded'
    when p_payment = 'paid' and not p_has_account then 'no_account'
    when p_payment = 'paid' then 'open'
    when p_payment = 'awaiting_confirmation' then 'payment_review'
    when p_payment = 'partially_paid' then 'partially_paid'
    else 'awaiting_payment'
  end;
$$;
revoke all on function private.digital_state(text, boolean, boolean) from public;

-- Os livros pagos que a conta comprou (em encomendas não canceladas), um por livro, com a
-- encomenda que mais conta (a paga, senão a mais recente) e o estado.
create or replace function public.my_digital_library()
returns table (
  download_id text, title text, description text, kind text, edition text, cover text, file_size bigint,
  book_id text, variant int, book_title text,
  order_id text, order_number text, ordered_at timestamptz, payment_status text, total numeric, amount_paid numeric,
  state text, downloads bigint, last_download timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  with mine as (
    select o.*
    from public.orders o
    where auth.uid() is not null
      and private.order_belongs_to(o, auth.uid())
      and coalesce(o.status, '') not in ('cancelled', 'canceled', 'cancelada')
      and coalesce(o.delivery_status, '') <> 'cancelled'
  ),
  pairs as (
    select distinct on (d.id) d.id as d_id, o.id as o_id
    from public.downloads d
    join mine o on private.order_has_item(o.items, d.book_id, d.variant)
    where d.access = 'paid' and d.published and d.file_path <> ''
    order by d.id, (o.payment_status = 'paid') desc, o.created desc
  )
  select d.id, d.title, d.description, d.kind, d.edition, d.cover, d.file_size,
         d.book_id, d.variant, b.title,
         o.id, o.order_number, o.created, coalesce(nullif(o.payment_status, ''), 'pending'), o.total::numeric, coalesce(o.amount_paid, 0)::numeric,
         private.digital_state(
           o.payment_status,
           exists (select 1 from public.download_blocks k where k.download_id = d.id and k.user_id = auth.uid()),
           true
         ),
         (select count(*) from public.download_events e where e.download_id = d.id and e.user_id = auth.uid()),
         (select max(e.created) from public.download_events e where e.download_id = d.id and e.user_id = auth.uid())
  from pairs p
  join public.downloads d on d.id = p.d_id
  join public.orders o on o.id = p.o_id
  left join public.stock_books b on b.id = d.book_id
  order by o.created desc, d.title
  limit 300;
$$;
revoke all on function public.my_digital_library() from public, anon;
grant execute on function public.my_digital_library() to authenticated;

-- ---------------------------------------------------------------------------
-- 5. O painel da equipa: quem comprou cada livro digital, o pagamento e o acesso
-- ---------------------------------------------------------------------------
create or replace function public.digital_access_overview(p_search text default '', p_state text default '', p_limit integer default 300)
returns table (
  download_id text, title text, book_id text, variant int,
  order_id text, order_number text, ordered_at timestamptz,
  customer_id uuid, customer_name text, customer_email text, customer_code text,
  payment_status text, total numeric, amount_paid numeric,
  state text, block_reason text, blocked_at timestamptz, downloads bigint, last_download timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_q text := lower(btrim(coalesce(p_search, '')));
begin
  if not private.can_manage_digital() then
    raise exception 'Sem permissão para ver os acessos aos livros digitais.' using errcode = '42501';
  end if;
  return query
  with pairs as (
    select d.id as d_id, d.title as d_title, d.book_id as d_book, d.variant as d_variant, o.*,
           coalesce(o.customer_id, (
             select u.id from auth.users u
             where lower(u.email) = lower(coalesce(o.customer_email, '')) and u.email_confirmed_at is not null
               and coalesce(u.email, '') <> ''
             limit 1
           )) as who
    from public.downloads d
    join public.orders o on private.order_has_item(o.items, d.book_id, d.variant)
    where d.access = 'paid' and d.file_path <> ''
      and coalesce(o.status, '') not in ('cancelled', 'canceled', 'cancelada')
      and coalesce(o.delivery_status, '') <> 'cancelled'
  ),
  rows as (
    select p.*, k.reason as k_reason, k.created as k_at,
           private.digital_state(p.payment_status, k.id is not null, p.who is not null) as st
    from pairs p
    left join public.download_blocks k on k.download_id = p.d_id and k.user_id = p.who
  )
  select r.d_id, r.d_title, r.d_book, r.d_variant,
         r.id, r.order_number, r.created,
         r.who, coalesce(r.customer_name, ''), coalesce(r.customer_email, ''), coalesce(nullif(r.customer_code, ''), pr.customer_code, ''),
         coalesce(nullif(r.payment_status, ''), 'pending'), r.total::numeric, coalesce(r.amount_paid, 0)::numeric,
         r.st, r.k_reason, r.k_at,
         (select count(*) from public.download_events e where e.download_id = r.d_id and e.user_id = r.who),
         (select max(e.created) from public.download_events e where e.download_id = r.d_id and e.user_id = r.who)
  from rows r
  left join public.profiles pr on pr.id = r.who
  where (coalesce(p_state, '') = '' or r.st = p_state)
    and (v_q = '' or lower(r.d_title) like '%' || v_q || '%' or lower(coalesce(r.order_number, '')) like '%' || v_q || '%'
         or lower(coalesce(r.customer_name, '')) like '%' || v_q || '%' or lower(coalesce(r.customer_email, '')) like '%' || v_q || '%'
         or lower(coalesce(nullif(r.customer_code, ''), pr.customer_code, '')) like '%' || v_q || '%')
  order by (r.st = 'payment_review') desc, r.created desc
  limit least(greatest(coalesce(p_limit, 300), 1), 500);
end;
$$;
revoke all on function public.digital_access_overview(text, text, integer) from public, anon;
grant execute on function public.digital_access_overview(text, text, integer) to authenticated;

-- ---------------------------------------------------------------------------
-- 6. Aviso ao cliente quando os livros digitais abrem
-- ---------------------------------------------------------------------------
create or replace function private.orders_digital_unlocked()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_titles text;
  v_count int;
  v_number text;
begin
  if new.customer_id is null or not private.order_unlocks(new) then
    return null;
  end if;
  select count(*), string_agg(d.title, ', ' order by d.title)
    into v_count, v_titles
  from public.downloads d
  where d.access = 'paid' and d.published and d.file_path <> ''
    and private.order_has_item(new.items, d.book_id, d.variant);
  if coalesce(v_count, 0) = 0 then
    return null;
  end if;
  v_number := left(coalesce(nullif(new.order_number, ''), new.id), 400);
  insert into public.customer_notifications (customer_id, kind, title, body, href, order_id)
  values (new.customer_id, 'order',
    case when v_count = 1 then 'Livro digital disponível' else 'Livros digitais disponíveis' end,
    left('Já pode abrir ' || v_titles || ' (encomenda ' || v_number || '). Está na sua biblioteca.', 500),
    '/profile?tab=biblioteca', new.id);
  return null;
end;
$$;
revoke execute on function private.orders_digital_unlocked() from public, anon, authenticated;

drop trigger if exists orders_livros_digitais on public.orders;
create trigger orders_livros_digitais
  after update of payment_status on public.orders
  for each row
  when (new.payment_status = 'paid' and old.payment_status is distinct from 'paid')
  execute function private.orders_digital_unlocked();
