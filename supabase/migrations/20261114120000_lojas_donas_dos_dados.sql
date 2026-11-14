-- Lojas, fases 1 e 2 (2026-11-14): cada loja passa a ser dona dos seus dados, e cada loja diz que
-- produtos tem.
--
-- Pedido do dono: saber para onde vai uma venda de Catumbela, quantos colportores são de cada
-- loja, e que cada loja possa marcar nos produtos «temos» ou «não temos», para quem compra saber
-- em que lojas está cada livro. Decisões: disponibilidade «temos / não temos», sem quantidades; cada
-- colportor fica com a loja que serve a sua província, que a equipa pode mudar.
--
-- 0. physical_stores.service_provinces — as províncias que cada loja serve, como o dono as deu:
--    Catumbela serve Benguela e o Cuanza Sul; a da Huíla (Lubango), a Huíla, o Namibe e o Cunene; a
--    do Huambo, só o Huambo. E há uma loja nova, a do Bié, que serve o Bié, o Cuando e o Cubango.
--    Entra escondida do site e sem levantamento, porque ainda não tem morada, telefone nem horário:
--    a equipa completa-a em Lojas e activa-a. Até lá, as encomendas dessas províncias já são dela.
-- 1. orders.store_id — a loja da encomenda: a do levantamento; numa entrega ao domicílio, a loja que
--    serve a província de entrega; nenhuma numa encomenda só digital ou numa província que nenhuma
--    loja serve (Luanda, por agora). Grava-se quando a encomenda entra, e outra vez se mudarem o
--    envio, a loja ou a província: mudar o nome de uma loja já não a separa das suas encomendas. O
--    nome escrito (orders.pickup_store) fica como estava — é o que o cliente escolheu e o que os
--    emails mostram. As encomendas que já existem recebem a loja pela mesma regra, sem acordar os
--    outros gatilhos (estado, stock, avisos).
-- 2. colporteurs.store_id — a loja de cada colportor: por omissão, a que serve a província dele,
--    quando entra ou quando lhe dão a província; a equipa muda-a na ficha e essa escolha fica. Os
--    colportores que já existem recebem a da província.
-- 3. colporteur_documents.store_id — a loja de cada guia (de onde saem ou para onde voltam os
--    livros): a do colportor quando a guia é feita. O stock continua a ser um só (o do KiGest); isto
--    diz de que loja é cada guia. As guias antigas ficam com a loja que o colportor tem hoje.
-- 4. public.store_stock — «temos» ou «não temos», por loja e produto. Sem linha é «por marcar», e o
--    site nunca o mostra como «não temos». Lê-se publicamente (lojas e produtos activos; a equipa vê
--    tudo); escreve-se só pela função public.store_stock_set, uma lista de produtos de cada vez.
-- 5. Permissão nova manage_store_stock («Stock da loja»): marca a disponibilidade das lojas a que a
--    pessoa pertence — a loja da sua ficha de funcionário ligada à conta (private.my_store_ids;
--    uma ficha de quem «saiu» não conta). Quem gere o catálogo marca a de qualquer loja. As três
--    listas de chaves (private.permission_keys, aqui; app/web/src/lib/permissions.js;
--    supabase/functions/app/permissions.ts) mudam juntas: uma chave que falte numa delas é apagada ao
--    gravar um gestor ou um cargo.
--
-- Reverter: drop de public.store_stock, de public.store_stock_set, public.store_stock_my_stores,
-- private.loja_da_encomenda, private.loja_da_provincia, private.loja_da_provincia_nome,
-- private.my_store_ids, private.can_edit_store_stock, dos gatilhos orders_loja, colporteurs_b_loja
-- e colporteur_documents_loja (e das suas funções), das três colunas store_id e de
-- physical_stores.service_provinces; apagar a loja do Bié no painel se ainda não tiver nada; repor
-- private.permission_keys sem manage_store_stock (20261108190000_funcionarios).

-- ---------------------------------------------------------------------------------------------
-- 0. As províncias que cada loja serve
-- ---------------------------------------------------------------------------------------------
-- Os nomes são os da divisão de 2024 (ANGOLA_PROVINCES_2024, em app/web/src/lib/angolaGeo.js), os
-- mesmos das moradas de entrega. Compara-se sem acentos: a província das lojas é texto escrito à
-- mão («Huíla», «Huila») (private.plain_text, 20261108220000_entregas_loja_e_robustez).
alter table public.physical_stores add column if not exists service_provinces text[] not null default '{}'::text[];
alter table public.physical_stores drop constraint if exists physical_stores_service_provinces_check;
alter table public.physical_stores add constraint physical_stores_service_provinces_check
  check (cardinality(service_provinces) <= 30
         and array_position(service_provinces, null) is null
         and array_position(service_provinces, '') is null);
comment on column public.physical_stores.service_provinces is
  'As províncias que a loja serve (nomes de 2024). Uma encomenda ao domicílio numa delas é desta loja; '
  'a própria província da loja conta mesmo que falte aqui (migração lojas_donas_dos_dados).';

-- As três lojas que já existem, pelo nome ou pela província (como nas migrações das fotografias).
-- Só onde a lista ainda está vazia: o que a equipa já tiver escrito no painel fica.
update public.physical_stores set service_provinces = array['Benguela', 'Cuanza Sul']
where (name ilike '%Catumbela%' or private.plain_text(province) = 'benguela') and service_provinces = '{}'::text[];
update public.physical_stores set service_provinces = array['Huíla', 'Namibe', 'Cunene']
where (name ilike '%Lubango%' or private.plain_text(province) = 'huila') and service_provinces = '{}'::text[];
update public.physical_stores set service_provinces = array['Huambo']
where (name ilike '%Huambo%' or private.plain_text(province) = 'huambo') and service_provinces = '{}'::text[];

-- A loja do Bié. Se a equipa já a tiver criado, fica com a lista; se não, nasce escondida e sem
-- levantamento, com a província por morada (como a do Huambo em 20261101205332), à espera dos dados.
update public.physical_stores set service_provinces = array['Bié', 'Cuando', 'Cubango']
where (name ilike '%Bié%' or private.plain_text(province) = 'bie') and service_provinces = '{}'::text[];
insert into public.physical_stores (name, province, address, active, pickup_enabled, service_provinces, sort_order)
select 'Livraria Adventista — Bié', 'Bié', 'Bié', false, false, array['Bié', 'Cuando', 'Cubango'],
       coalesce((select max(s.sort_order) from public.physical_stores s), 0) + 1
where not exists (select 1 from public.physical_stores s where s.name ilike '%Bié%' or private.plain_text(s.province) = 'bie');

-- A loja que serve uma província: a que a tem na sua lista; depois, a que fica nela. Se houver mais
-- do que uma, a activa, pela ordem das lojas. Uma loja escondida também serve (a do Bié, enquanto
-- não abre): a venda é dela na mesma.
create or replace function private.loja_da_provincia_nome(p_province text)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  with alvo as (select private.plain_text(p_province) as p)
  select s.id
  from public.physical_stores s, alvo
  where alvo.p <> ''
    and (exists (select 1 from unnest(s.service_provinces) sp where private.plain_text(sp) = alvo.p)
         or private.plain_text(s.province) = alvo.p)
  order by exists (select 1 from unnest(s.service_provinces) sp where private.plain_text(sp) = alvo.p) desc,
           s.active desc, s.sort_order, s.created
  limit 1;
$$;
revoke all on function private.loja_da_provincia_nome(text) from public, anon, authenticated;

create or replace function private.loja_da_provincia(p_province_id text)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select private.loja_da_provincia_nome((select p.name from public.angola_provinces p where p.id = p_province_id));
$$;
revoke all on function private.loja_da_provincia(text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------------------------
-- 1. A loja de cada encomenda
-- ---------------------------------------------------------------------------------------------
alter table public.orders add column if not exists store_id text references public.physical_stores (id) on delete set null;
create index if not exists orders_store_idx on public.orders (store_id, created desc);
comment on column public.orders.store_id is
  'A loja da encomenda: a do levantamento, ou a que serve a província de entrega; nenhuma nas só digitais ou '
  'numa província que nenhuma loja serve. Gatilho orders_loja (migração lojas_donas_dos_dados).';

-- Levantamento: a loja escolhida, pelo id ou pelo nome (private.order_store_id, a mesma que encaminha
-- os avisos). As encomendas antigas sem método de envio, mas com loja escrita, também. Entrega ao
-- domicílio (normal ou expressa): a loja da província.
create or replace function private.loja_da_encomenda(p_shipping_method text, p_pickup_store text, p_delivery_province text)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when coalesce(p_shipping_method, '') = 'digital' then null
    when coalesce(p_shipping_method, '') = 'pickup'
      or (coalesce(p_shipping_method, '') = '' and nullif(btrim(coalesce(p_pickup_store, '')), '') is not null)
      then private.order_store_id('pickup', p_pickup_store)
    else private.loja_da_provincia_nome(p_delivery_province)
  end;
$$;
revoke all on function private.loja_da_encomenda(text, text, text) from public, anon, authenticated;

create or replace function private.orders_loja()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    -- Quem cria a encomenda com a loja já escolhida (uma venda ao balcão, um dia) fica com ela.
    if new.store_id is null then
      new.store_id := private.loja_da_encomenda(new.shipping_method, new.pickup_store, new.delivery_province);
    end if;
  elsif new.shipping_method is distinct from old.shipping_method
     or new.pickup_store is distinct from old.pickup_store
     or new.delivery_province is distinct from old.delivery_province then
    new.store_id := private.loja_da_encomenda(new.shipping_method, new.pickup_store, new.delivery_province);
  end if;
  return new;
end;
$$;
revoke all on function private.orders_loja() from public, anon, authenticated;
drop trigger if exists orders_loja on public.orders;
create trigger orders_loja before insert or update of shipping_method, pickup_store, delivery_province on public.orders
  for each row execute function private.orders_loja();

-- As encomendas que já existem, sem acordar os outros gatilhos (estado, stock, avisos, registo).
alter table public.orders disable trigger user;
update public.orders
set store_id = private.loja_da_encomenda(shipping_method, pickup_store, delivery_province)
where store_id is null;
alter table public.orders enable trigger user;

-- ---------------------------------------------------------------------------------------------
-- 2. A loja de cada colportor
-- ---------------------------------------------------------------------------------------------
alter table public.colporteurs add column if not exists store_id text references public.physical_stores (id) on delete set null;
create index if not exists colporteurs_store_idx on public.colporteurs (store_id);
comment on column public.colporteurs.store_id is
  'A loja do colportor: por omissão a da província; a equipa muda-a na ficha (migração lojas_donas_dos_dados).';

-- Depois de colporteurs_a_guarda, que põe a província da igreja quando falta.
create or replace function private.colporteurs_loja()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.store_id is null and new.province_id is not null
     and (tg_op = 'INSERT' or new.province_id is distinct from old.province_id) then
    new.store_id := private.loja_da_provincia(new.province_id);
  end if;
  return new;
end;
$$;
revoke all on function private.colporteurs_loja() from public, anon, authenticated;
drop trigger if exists colporteurs_b_loja on public.colporteurs;
create trigger colporteurs_b_loja before insert or update on public.colporteurs
  for each row execute function private.colporteurs_loja();

-- Os que já existem: sem mexer na data de alteração nem nos avisos.
alter table public.colporteurs disable trigger user;
update public.colporteurs
set store_id = private.loja_da_provincia(province_id)
where store_id is null and province_id is not null;
alter table public.colporteurs enable trigger user;

-- ---------------------------------------------------------------------------------------------
-- 3. A loja de cada guia
-- ---------------------------------------------------------------------------------------------
alter table public.colporteur_documents add column if not exists store_id text references public.physical_stores (id) on delete set null;
create index if not exists colporteur_documents_store_idx on public.colporteur_documents (store_id);
comment on column public.colporteur_documents.store_id is
  'A loja de onde saem (ou para onde voltam) os livros da guia: a do colportor quando a guia é feita.';

create or replace function private.colporteur_documents_loja()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.store_id is null then
    select c.store_id into new.store_id from public.colporteurs c where c.id = new.colporteur_id;
  end if;
  return new;
end;
$$;
revoke all on function private.colporteur_documents_loja() from public, anon, authenticated;
drop trigger if exists colporteur_documents_loja on public.colporteur_documents;
create trigger colporteur_documents_loja before insert on public.colporteur_documents
  for each row execute function private.colporteur_documents_loja();

update public.colporteur_documents d
set store_id = c.store_id
from public.colporteurs c
where c.id = d.colporteur_id and d.store_id is null and c.store_id is not null;

-- ---------------------------------------------------------------------------------------------
-- 4. «Temos» / «não temos», por loja
-- ---------------------------------------------------------------------------------------------
create table if not exists public.store_stock (
  store_id text not null references public.physical_stores (id) on delete cascade,
  book_id text not null references public.stock_books (id) on delete cascade,
  available boolean not null,
  updated timestamptz not null default now(),
  updated_by uuid references public.profiles (id) on delete set null,
  primary key (store_id, book_id)
);
create index if not exists store_stock_book_idx on public.store_stock (book_id);
create index if not exists store_stock_updated_by_idx on public.store_stock (updated_by);
comment on table public.store_stock is
  'Disponibilidade por loja: available = temos (true) ou não temos (false). Sem linha = por marcar. '
  'Escreve-se por public.store_stock_set (migração lojas_donas_dos_dados).';

alter table public.store_stock enable row level security;
revoke all on public.store_stock from public, anon, authenticated;
grant select on public.store_stock to anon, authenticated;
grant all on public.store_stock to service_role;

-- O público vê o que é de lojas e produtos à vista; a equipa do catálogo e do stock das lojas vê tudo.
drop policy if exists "store_stock: lojas e produtos à vista, ou a equipa" on public.store_stock;
create policy "store_stock: lojas e produtos à vista, ou a equipa" on public.store_stock for select to anon, authenticated
  using (
    (exists (select 1 from public.physical_stores s where s.id = store_id and s.active)
     and exists (select 1 from public.stock_books b where b.id = book_id and b.active))
    or (select private.has_permission('manage_catalog'))
    or (select private.has_permission('manage_store_stock'))
  );

-- As lojas da pessoa: a da sua ficha de funcionário ligada à conta (uma ficha de quem saiu não conta).
create or replace function private.my_store_ids()
returns text[]
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(array_agg(distinct m.store_id order by m.store_id), '{}'::text[])
  from public.staff_members m
  where m.profile_id = auth.uid() and m.store_id is not null and m.status <> 'saiu';
$$;
revoke all on function private.my_store_ids() from public, anon, authenticated;

-- Quem marca a disponibilidade de uma loja: o catálogo, qualquer loja; o stock da loja, as suas.
create or replace function private.can_edit_store_stock(p_store_id text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.has_permission('manage_catalog')
      or (private.has_permission('manage_store_stock') and p_store_id = any (private.my_store_ids()));
$$;
revoke all on function private.can_edit_store_stock(text) from public, anon, authenticated;

-- Marca uma lista de produtos numa loja: true = temos, false = não temos, null = por marcar (apaga).
-- Devolve quantos mudaram. Produtos que não existem são ignorados.
create or replace function public.store_stock_set(p_store_id text, p_book_ids text[], p_available boolean)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_n integer := 0;
begin
  if not private.can_edit_store_stock(p_store_id) then
    raise exception 'Sem permissão para marcar o stock desta loja.' using errcode = '42501';
  end if;
  if not exists (select 1 from public.physical_stores s where s.id = p_store_id) then
    raise exception 'Loja desconhecida.' using errcode = '22023';
  end if;
  if p_book_ids is null or cardinality(p_book_ids) = 0 then
    return 0;
  end if;
  if cardinality(p_book_ids) > 2000 then
    raise exception 'No máximo 2000 produtos de cada vez.' using errcode = '22023';
  end if;

  if p_available is null then
    delete from public.store_stock where store_id = p_store_id and book_id = any (p_book_ids);
    get diagnostics v_n = row_count;
    return v_n;
  end if;

  insert into public.store_stock (store_id, book_id, available, updated, updated_by)
  select p_store_id, b.id, p_available, now(), auth.uid()
  from public.stock_books b
  where b.id = any (p_book_ids)
  on conflict (store_id, book_id) do update
    set available = excluded.available, updated = excluded.updated, updated_by = excluded.updated_by
    where public.store_stock.available is distinct from excluded.available;
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;
revoke all on function public.store_stock_set(text, text[], boolean) from public, anon;
grant execute on function public.store_stock_set(text, text[], boolean) to authenticated, service_role;

-- As lojas que esta pessoa pode marcar (o painel mostra-lhe só essas).
create or replace function public.store_stock_my_stores()
returns table (id text, name text, province text, active boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select s.id, s.name, s.province, s.active
  from public.physical_stores s
  where private.has_permission('manage_catalog')
     or (private.has_permission('manage_store_stock') and s.id = any (private.my_store_ids()))
  order by s.active desc, s.sort_order, s.name;
$$;
revoke all on function public.store_stock_my_stores() from public, anon;
grant execute on function public.store_stock_my_stores() to authenticated, service_role;

-- ---------------------------------------------------------------------------------------------
-- 5. A permissão nova
-- ---------------------------------------------------------------------------------------------
create or replace function private.permission_keys()
returns text[]
language sql
immutable
set search_path = ''
as $$
  select array['manage_catalog','manage_orders','manage_settings','manage_users','manage_payments',
               'confirm_payments','view_reports','manage_marketing','manage_church_registry','manage_colporteurs',
               'manage_production','manage_staff','manage_finance','manage_store_stock'];
$$;
revoke all on function private.permission_keys() from public, anon;
grant execute on function private.permission_keys() to authenticated, service_role;
