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
--    do Huambo, só o Huambo. E há uma loja nova, a do Bié, no Cuito, que serve o Bié, o Cuando e o
--    Cubango. Ainda não abriu: entra escondida do site e sem levantamento, com o telefone e o
--    horário das outras lojas e as coordenadas do centro do Cuito. Quando abrir, a equipa activa-a
--    em Lojas. Até lá, as encomendas dessas províncias já são dela.
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
-- 6. Entregas por colportor: a oferta continua a ir por proximidade, mas o colportor levanta os
--    livros na sua loja (colporteurs.store_id) — um colportor do Namibe levanta no Lubango, a sede
--    da Missão Sul, mesmo a mais de 50 km. Antes, sem loja na província dele, a menos de 50 km ou na
--    do cliente, quem não tinha os livros consigo não recebia a oferta.
-- 7. As vendas de cada loja nos relatórios (private.vendas_encomendas, que public.vendas_do_sistema
--    e public.produtos_mais_vendidos leem) passam a contar pela loja gravada em cada encomenda
--    (orders.store_id), como o painel já fazia no navegador. Antes contavam pelo nome da loja do
--    levantamento e, nas entregas, pela loja da mesma província — uma entrega no Namibe não era de
--    loja nenhuma; agora é da do Lubango, que serve o Namibe.
--
-- Esta migração foi escrita como 20261114120000, a mesma versão de relatorios_de_todas_as_livrarias,
-- que entrou primeiro e já está aplicada: o supabase db push, que conhece as migrações pela versão,
-- dava esta por aplicada e nunca a corria. Passou a 20261114180000, depois de todas as do main, e
-- por isso a lista de chaves (5) mantém a edit_reports que relatorios_de_todas_as_livrarias criou, e
-- a função das vendas (7) parte da que ela escreveu.
--
-- Reverter: drop de public.store_stock, de public.store_stock_set, public.store_stock_my_stores,
-- private.loja_da_encomenda, private.loja_da_provincia, private.loja_da_provincia_nome,
-- private.my_store_ids, private.can_edit_store_stock, dos gatilhos orders_loja, colporteurs_b_loja
-- e colporteur_documents_loja (e das suas funções), das três colunas store_id e de
-- physical_stores.service_provinces; apagar a loja do Bié no painel se ainda não tiver nada; repor
-- private.permission_keys sem manage_store_stock e private.vendas_encomendas como em
-- 20261114120000_relatorios_de_todas_as_livrarias, e private.delivery_pickup_store como em
-- 20261108220000_entregas_loja_e_robustez.

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

-- A loja do Bié, no Cuito. Se a equipa já a tiver criado, fica com a lista e com o que lá escreveu.
-- Se não, nasce escondida e sem levantamento — ainda não abriu —, com o telefone e o horário das
-- outras lojas, como o dono pediu: o telefone da do Huambo (o único que as lojas têm) e o horário
-- da porta da do Lubango. As coordenadas são as do centro do Cuito (12°23′S, 16°56′E, GeoNames):
-- quando a loja abrir, a equipa afina o ponto no painel («Usar a minha localização»).
update public.physical_stores set service_provinces = array['Bié', 'Cuando', 'Cubango']
where (name ilike '%Bié%' or private.plain_text(province) = 'bie') and service_provinces = '{}'::text[];
insert into public.physical_stores (name, province, address, phone, whatsapp, hours, latitude, longitude, maps_url,
                                    active, pickup_enabled, service_provinces, sort_order)
select 'Livraria Adventista — Bié', 'Bié', 'Cuito',
       coalesce((select s.phone from public.physical_stores s
                 where (s.name ilike '%Huambo%' or private.plain_text(s.province) = 'huambo') and coalesce(s.phone, '') <> ''
                 order by s.active desc, s.created limit 1), ''),
       coalesce((select s.whatsapp from public.physical_stores s
                 where (s.name ilike '%Huambo%' or private.plain_text(s.province) = 'huambo') and coalesce(s.whatsapp, '') <> ''
                 order by s.active desc, s.created limit 1), ''),
       coalesce((select s.hours from public.physical_stores s
                 where (s.name ilike '%Lubango%' or private.plain_text(s.province) = 'huila') and coalesce(s.hours, '') <> ''
                 order by s.active desc, s.created limit 1), 'Seg–Qui 8h–17h30 · Sex, Dom e feriados 8h–13h'),
       -12.383333, 16.933333, 'https://www.google.com/maps?q=-12.383333,16.933333&z=16',
       false, false, array['Bié', 'Cuando', 'Cubango'],
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
               'manage_production','manage_staff','manage_finance','edit_reports','manage_store_stock'];
$$;
revoke all on function private.permission_keys() from public, anon;
grant execute on function private.permission_keys() to authenticated, service_role;

-- ---------------------------------------------------------------------------------------------
-- 6. Entregas por colportor: a loja dele primeiro
-- ---------------------------------------------------------------------------------------------
-- Pedido do dono (2026-11-14): a oferta de uma entrega continua a ir por proximidade — ao colportor
-- mais perto do cliente, como sempre (private.delivery_candidates não muda) —, e quem não tem os
-- livros consigo levanta-os na sua loja, a da sua missão. Um colportor do Namibe levanta no
-- Lubango: a Missão Sul tem a sede na Huíla. Antes só contava uma loja na província dele, a menos
-- de 50 km ou na província do cliente; o do Namibe não tinha nenhuma e não recebia a oferta.
-- A loja dele é colporteurs.store_id (por omissão a que serve a província; a equipa muda-a na
-- ficha). Uma loja escondida não conta (a do Bié, até abrir). O resto fica como estava em
-- 20261108220000_entregas_loja_e_robustez.
create or replace function private.delivery_pickup_store(p_colporteur uuid, p_order_province text)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  with me as (
    select c.latitude::double precision as lat, c.longitude::double precision as lng, p.name as province, c.store_id
    from public.colporteurs c
    left join public.angola_provinces p on p.id = c.province_id
    where c.id = p_colporteur
  ),
  cfg as (select coalesce(max(delivery_max_km), 50) as max_km from public.colporteur_settings where id = 1),
  s as (
    select s.id, s.name, s.sort_order,
      me.store_id is not null and s.id = me.store_id as is_his,
      me.province is not null and private.plain_text(s.province) = private.plain_text(me.province) as in_mine,
      private.plain_text(s.province) = private.plain_text(p_order_province) as in_order,
      case when me.lat is not null and me.lng is not null and coalesce(s.latitude, 0) <> 0 and coalesce(s.longitude, 0) <> 0
           then private.km_between(me.lat, me.lng, s.latitude, s.longitude) end as km
    from public.physical_stores s, me
    where s.active
  )
  select s.id
  from s, cfg
  where s.is_his or s.in_mine or s.in_order or (s.km is not null and s.km <= cfg.max_km)
  order by case when s.is_his then 0 when s.in_mine then 1 when s.km is not null and s.km <= cfg.max_km then 2 else 3 end,
           s.km asc nulls last, s.sort_order, s.name
  limit 1;
$$;
revoke all on function private.delivery_pickup_store(uuid, text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------------------------
-- 7. As vendas de cada loja nos relatórios, pela loja gravada em cada encomenda
-- ---------------------------------------------------------------------------------------------
-- A mesma função de 20261114120000_relatorios_de_todas_as_livrarias (as encomendas de um ano, com a
-- loja, o mês na hora de Luanda, o valor em cêntimos e os itens), com uma diferença só: a loja é
-- orders.store_id (1), em vez do nome da loja do levantamento ou da loja da mesma província. Uma
-- encomenda sem loja (só digital, ou de uma província que nenhuma loja serve) não é de nenhuma, como
-- no painel. public.vendas_do_sistema e public.produtos_mais_vendidos continuam a ler esta função, e
-- os dois números continuam a bater.
create or replace function private.vendas_encomendas(p_ano integer, p_so_pagas boolean)
returns table (encomenda text, loja_id text, mes integer, centimos numeric, itens jsonb)
language sql
stable
security definer
set search_path = ''
as $$
  with limites as (
    -- Luanda está em UTC+1 todo o ano: o ano começa às 23:00 UTC de 31 de Dezembro.
    select make_timestamptz(p_ano, 1, 1, 0, 0, 0, 'UTC') - interval '1 hour' as de,
           make_timestamptz(p_ano + 1, 1, 1, 0, 0, 0, 'UTC') - interval '1 hour' as ate
  ),
  enc as (
    select
      o.id,
      o.store_id,
      case when p_so_pagas then o.paid_at else o.created end as quando,
      case when p_so_pagas
        then least(round(coalesce(o.amount_paid, 0) * 100) - round(coalesce(o.amount_refunded, 0) * 100),
                   round(coalesce(o.total, 0)::numeric * 100))
             - round(coalesce(o.shipping_cost, 0)::numeric * 100)
        else round(coalesce(o.total, 0)::numeric * 100) - round(coalesce(o.shipping_cost, 0)::numeric * 100)
      end as centimos,
      case when jsonb_typeof(o.items) = 'array' then o.items else '[]'::jsonb end as itens
    from public.orders o, limites l
    where (case when p_so_pagas then o.paid_at else o.created end) >= l.de
      and (case when p_so_pagas then o.paid_at else o.created end) < l.ate
      and coalesce(o.status, '') <> 'cancelled'
      and coalesce(o.delivery_status, '') <> 'cancelled'
  )
  select
    e.id,
    e.store_id,
    extract(month from (e.quando + interval '1 hour') at time zone 'UTC')::integer,
    e.centimos,
    e.itens
  from enc e
  where not p_so_pagas or e.centimos > 0;
$$;
revoke all on function private.vendas_encomendas(integer, boolean) from public, anon, authenticated;
