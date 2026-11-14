-- Colportores: a igreja de cada um, o cartão de identificação, as avaliações dos clientes e a
-- moderação das avaliações dos livros. Guia: docs/COLPORTAGEM.md (secções 6 a 9).
--
-- 1. Igrejas: telefone, email, responsável, número de membros e localização (opcionais). A lista
--    é a das igrejas já registadas (Registo da Igreja); nada é importado aqui.
-- 2. Igrejas e colportores: church_colporteurs() dá, por igreja, os colportores activos, as
--    candidaturas, as categorias, as horas e vendas do ano, as entregas e a média das avaliações;
--    com uma igreja, também a lista dos colportores. church_directory() passa a dizer o campo.
-- 3. Cartão: cada colportor activo tem um código de verificação de 8 letras (card_check), que vai
--    no cartão impresso e no QR. colporteur_card() emite ou reemite o cartão (reemitir invalida
--    o anterior); colporteur_verify(código, verificação) é público e diz se o cartão é válido,
--    com o nome, a categoria e a igreja — nunca o telefone. Sem o código de verificação não diz
--    nada: com códigos CPT seguidos, qualquer pessoa podia listar todos os colportores.
-- 4. Avaliações dos colportores: o cliente avalia (1 a 5 estrelas e comentário) o colportor que
--    lhe entregou a encomenda, ou o do código usado na compra, depois de a encomenda estar paga e
--    entregue. Uma avaliação por encomenda e colportor; o cliente pode mudá-la. A equipa pode
--    ocultá-la, com motivo. O colportor vê a média e os comentários, sem saber quem escreveu.
-- 5. Livros mais vendidos por colportor ou por igreja (relatórios validados e vendas no site com o
--    código), com a média das avaliações de cada livro.
-- 6. Avaliações dos livros: a equipa do catálogo pode ocultar uma avaliação (com motivo); fica
--    visível só para quem a escreveu e para a equipa. O autor não a consegue voltar a mostrar.
--
-- A loja de cada colportor (colporteurs.store_id, de 20261114180000_lojas_donas_dos_dados) vai no
-- cartão, na verificação e na lista de cada igreja: é a loja onde ele levanta os livros e presta
-- contas. Por isso esta migração corre depois dela (foi escrita como 20261114160000, a mesma versão
-- de capas_cores_e_nomes_do_catalogo, que já está aplicada: o supabase db push dava-a por aplicada).
--
-- Reverter: apagar as funções e a tabela colporteur_reviews; as colunas novas podem ficar.

-- 1. Igrejas ---------------------------------------------------------------------------------
alter table public.churches
  add column if not exists phone text not null default '' check (phone = '' or phone ~ '^[29][0-9]{8}$'),
  add column if not exists email text not null default '' check (email = '' or email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  add column if not exists responsible_name text not null default '' check (length(responsible_name) <= 120),
  add column if not exists members_count integer check (members_count is null or members_count between 0 and 100000),
  add column if not exists latitude double precision check (latitude is null or latitude between -18.5 and -4.0),
  add column if not exists longitude double precision check (longitude is null or longitude between 11.0 and 24.5);
alter table public.churches drop constraint if exists churches_coordenadas_juntas;
alter table public.churches add constraint churches_coordenadas_juntas check ((latitude is null) = (longitude is null));
comment on column public.churches.phone is 'Telefone da igreja (9 algarismos, móvel 9… ou fixo 2…).';
comment on column public.churches.responsible_name is 'Quem responde pela igreja no dia-a-dia (ancião, secretário).';

-- 2. Os tipos de evento do histórico do colportor: mais «cartao».
alter table public.colporteur_events drop constraint if exists colporteur_events_kind_check;
alter table public.colporteur_events add constraint colporteur_events_kind_check
  check (kind in ('candidatura', 'estado', 'categoria', 'convite', 'conta', 'percentagem', 'nota', 'cartao'));

-- 3. Cartão ----------------------------------------------------------------------------------
alter table public.colporteurs
  add column if not exists card_check text check (card_check is null or card_check ~ '^[A-HJ-NP-Z2-9]{8}$'),
  add column if not exists card_issued_at timestamptz;
comment on column public.colporteurs.card_check is 'Código de verificação do cartão (8 letras e algarismos, sem I, O, 0 e 1). Muda ao reemitir.';

-- O código de verificação e a data do cartão só mudam por colporteur_card().
create or replace function private.colporteurs_cartao_guarda()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce(current_setting('app.colporteur_card', true), '') = '1' or auth.role() = 'service_role' then
    return new;
  end if;
  if tg_op = 'INSERT' then
    new.card_check := null;
    new.card_issued_at := null;
  elsif new.card_check is distinct from old.card_check or new.card_issued_at is distinct from old.card_issued_at then
    raise exception 'O cartão emite-se pelo botão «Cartão» (fica no histórico).' using errcode = '42501';
  end if;
  return new;
end;
$$;
revoke all on function private.colporteurs_cartao_guarda() from public, anon, authenticated;
drop trigger if exists colporteurs_b_cartao on public.colporteurs;
create trigger colporteurs_b_cartao before insert or update on public.colporteurs
  for each row execute function private.colporteurs_cartao_guarda();

-- 8 símbolos de um alfabeto de 32 (sem I, O, 0 e 1, que se confundem): 40 bits ao acaso.
create or replace function private.codigo_de_cartao()
returns text
language plpgsql
volatile
set search_path = ''
as $$
declare
  a constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  b bytea := decode(replace(gen_random_uuid()::text, '-', ''), 'hex');
  r text := '';
  i integer;
begin
  -- Os bytes 6 e 8 de um UUID v4 têm bits fixos (versão e variante): ficam de fora.
  foreach i in array array[0, 1, 2, 3, 4, 5, 9, 10] loop
    r := r || substr(a, (get_byte(b, i) % 32) + 1, 1);
  end loop;
  return r;
end;
$$;
revoke all on function private.codigo_de_cartao() from public, anon, authenticated;

create or replace function private.cartao_json(v public.colporteurs)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'code', v.code, 'full_name', v.full_name, 'category', v.category, 'status', v.status,
    'card_check', v.card_check, 'card_issued_at', v.card_issued_at,
    'valid_until', case when v.card_issued_at is null then null
                        else make_date(extract(year from v.card_issued_at at time zone 'Africa/Luanda')::int, 12, 31) end,
    'start_date', v.start_date,
    'church', (select c.name from public.churches c where c.id = v.church_id),
    'district', (select d.name from public.churches c join public.church_districts d on d.id = c.district_id where c.id = v.church_id),
    'field', (select coalesce(nullif(f.short_name, ''), f.name) from public.churches c join public.church_fields f on f.id = c.field_id where c.id = v.church_id),
    'church_other', v.church_other,
    'province', (select name from public.angola_provinces where id = v.province_id),
    'store', (select s.name from public.physical_stores s where s.id = v.store_id)
  );
$$;
revoke all on function private.cartao_json(public.colporteurs) from public, anon, authenticated;

-- O cartão: sem p_id, o do próprio colportor; com p_id, um colportor (equipa). Emite o código de
-- verificação na primeira vez; p_reissue = true dá um novo (o cartão anterior deixa de valer).
create or replace function public.colporteur_card(p_id uuid default null, p_reissue boolean default false)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v public.colporteurs;
  v_staff boolean := private.can_manage_colporteurs();
begin
  if p_id is null then
    select * into v from public.colporteurs where profile_id = auth.uid();
    if v.id is null then raise exception 'Esta conta não é de um colportor.' using errcode = '42501'; end if;
    if p_reissue then raise exception 'Só a equipa reemite cartões.' using errcode = '42501'; end if;
  else
    if not v_staff then raise exception 'Sem permissão para os cartões dos colportores.' using errcode = '42501'; end if;
    select * into v from public.colporteurs where id = p_id for update;
    if v.id is null then raise exception 'Colportor não encontrado.' using errcode = 'P0002'; end if;
  end if;
  if v.status <> 'activo' or v.code is null then
    raise exception 'O cartão só existe para colportores activos.' using errcode = '22023';
  end if;
  if v.card_check is null or p_reissue then
    perform set_config('app.colporteur_card', '1', true);
    update public.colporteurs set card_check = private.codigo_de_cartao(), card_issued_at = now()
      where id = v.id returning * into v;
    perform set_config('app.colporteur_card', '', true);
    insert into public.colporteur_events (colporteur_id, kind, detail, actor)
      values (v.id, 'cartao', jsonb_build_object('accao', case when p_reissue then 'reemitido' else 'emitido' end), auth.uid());
  end if;
  return private.cartao_json(v);
end;
$$;

-- Verificação pública (a página /colportor/verificar e o QR do cartão). Sem o código de
-- verificação certo responde só { found: false }.
create or replace function public.colporteur_verify(p_code text, p_check text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v public.colporteurs;
  v_ate date;
  j jsonb;
begin
  select * into v from public.colporteurs
    where code = public.normalize_person_code(p_code)
      and card_check is not null
      and card_check = upper(regexp_replace(coalesce(p_check, ''), '[\s-]', '', 'g'));
  if v.id is null then return jsonb_build_object('found', false); end if;
  j := private.cartao_json(v);
  v_ate := (j ->> 'valid_until')::date;
  return jsonb_build_object(
    'found', true,
    'valid', v.status = 'activo' and v_ate is not null and (now() at time zone 'Africa/Luanda')::date <= v_ate,
    'expired', v_ate is not null and (now() at time zone 'Africa/Luanda')::date > v_ate,
    'status', v.status,
    'code', v.code, 'full_name', v.full_name, 'category', v.category,
    'church', j ->> 'church', 'district', j ->> 'district', 'field', j ->> 'field',
    'store', j ->> 'store',
    'valid_until', v_ate, 'start_date', v.start_date
  );
end;
$$;

-- 4. Avaliações dos colportores ----------------------------------------------------------------
create table if not exists public.colporteur_reviews (
  id uuid primary key default gen_random_uuid(),
  colporteur_id uuid not null references public.colporteurs(id) on delete cascade,
  order_id text not null references public.orders(id) on delete cascade,
  kind text not null check (kind in ('entrega', 'venda')),
  user_id uuid references auth.users(id) on delete set null,
  rating smallint not null check (rating between 1 and 5),
  comment text not null default '' check (length(comment) <= 1000),
  hidden boolean not null default false,
  hidden_reason text not null default '' check (length(hidden_reason) <= 300),
  hidden_by uuid,
  created timestamptz not null default now(),
  updated timestamptz not null default now(),
  unique (order_id, colporteur_id)
);
create index if not exists colporteur_reviews_colporteur_idx on public.colporteur_reviews (colporteur_id, created desc);
create index if not exists colporteur_reviews_user_idx on public.colporteur_reviews (user_id);
comment on table public.colporteur_reviews is
  'Avaliações dos clientes aos colportores (quem entregou, ou o do código na compra). Escrevem-se por colporteur_review_save.';

alter table public.colporteur_reviews enable row level security;
revoke all on public.colporteur_reviews from public, anon, authenticated;
grant select on public.colporteur_reviews to authenticated;
grant all on public.colporteur_reviews to service_role;
drop policy if exists "colporteur_reviews: equipa ou o autor lê" on public.colporteur_reviews;
create policy "colporteur_reviews: equipa ou o autor lê" on public.colporteur_reviews for select to authenticated
  using ((select private.can_manage_colporteurs()) or user_id = (select auth.uid()));

-- A encomenda do cliente com sessão, pelo número: dele pela conta ou pelo email.
create or replace function private.encomenda_do_cliente(p_order_number text)
returns public.orders
language sql
stable
security definer
set search_path = ''
as $$
  select o.* from public.orders o
  where o.order_number = btrim(coalesce(p_order_number, ''))
    and auth.uid() is not null
    and (o.customer_id = auth.uid()
         or (coalesce(auth.jwt() ->> 'email', '') <> '' and lower(o.customer_email) = lower(auth.jwt() ->> 'email')))
  order by o.created desc
  limit 1;
$$;
revoke all on function private.encomenda_do_cliente(text) from public, anon, authenticated;

-- Os colportores que o cliente pode avaliar nesta encomenda: quem a entregou (entrega feita) e o
-- do código usado na compra (encomenda paga e entregue, não cancelada).
create or replace function private.alvos_da_avaliacao(o public.orders)
returns table (colporteur_id uuid, kind text)
language sql
stable
security definer
set search_path = ''
as $$
  select distinct on (x.colporteur_id) x.colporteur_id, x.kind
  from (
    select d.colporteur_id, 'entrega'::text as kind, 1 as ordem
      from public.colporteur_deliveries d
      where d.order_id = o.id and d.status = 'delivered'
    union all
    select o.colporteur_id, 'venda', 2
      where o.colporteur_id is not null
        and coalesce(o.status, '') not in ('cancelled', 'canceled', 'cancelada')
        and o.payment_status = 'paid'
        and (o.delivery_status = 'delivered' or o.customer_confirmed_at is not null)
  ) x
  order by x.colporteur_id, x.ordem;
$$;
revoke all on function private.alvos_da_avaliacao(public.orders) from public, anon, authenticated;

create or replace function public.colporteur_review_targets(p_order_number text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  o public.orders;
begin
  o := private.encomenda_do_cliente(p_order_number);
  if o.id is null then return '[]'::jsonb; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'colporteur_id', c.id, 'code', c.code, 'full_name', c.full_name, 'kind', a.kind,
      'review', (select jsonb_build_object('rating', r.rating, 'comment', r.comment, 'updated', r.updated, 'hidden', r.hidden)
                   from public.colporteur_reviews r where r.order_id = o.id and r.colporteur_id = c.id))
      order by a.kind)
    from private.alvos_da_avaliacao(o) a join public.colporteurs c on c.id = a.colporteur_id), '[]'::jsonb);
end;
$$;

create or replace function public.colporteur_review_save(p_order_number text, p_colporteur_id uuid, p_rating integer, p_comment text default '')
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  o public.orders;
  v_kind text;
  r public.colporteur_reviews;
begin
  if p_rating is null or p_rating not between 1 and 5 then
    raise exception 'Escolha de 1 a 5 estrelas.' using errcode = '22023';
  end if;
  if length(btrim(coalesce(p_comment, ''))) > 1000 then
    raise exception 'O comentário tem no máximo 1000 caracteres.' using errcode = '22023';
  end if;
  o := private.encomenda_do_cliente(p_order_number);
  if o.id is null then raise exception 'Encomenda não encontrada nesta conta.' using errcode = '42501'; end if;
  select a.kind into v_kind from private.alvos_da_avaliacao(o) a where a.colporteur_id = p_colporteur_id;
  if v_kind is null then
    raise exception 'Só se avalia o colportor de uma encomenda paga e entregue.' using errcode = '42501';
  end if;
  insert into public.colporteur_reviews (colporteur_id, order_id, kind, user_id, rating, comment)
    values (p_colporteur_id, o.id, v_kind, auth.uid(), p_rating, btrim(coalesce(p_comment, '')))
  on conflict (order_id, colporteur_id) do update
    set rating = excluded.rating, comment = excluded.comment, user_id = excluded.user_id, updated = now()
  returning * into r;
  return jsonb_build_object('id', r.id, 'rating', r.rating, 'comment', r.comment, 'hidden', r.hidden);
end;
$$;

create or replace function public.colporteur_review_hide(p_id uuid, p_hidden boolean, p_reason text default '')
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if not private.can_manage_colporteurs() then
    raise exception 'Sem permissão para moderar as avaliações dos colportores.' using errcode = '42501';
  end if;
  if p_hidden and length(btrim(coalesce(p_reason, ''))) < 3 then
    raise exception 'Diga porque oculta a avaliação.' using errcode = '22023';
  end if;
  update public.colporteur_reviews
    set hidden = p_hidden,
        hidden_reason = case when p_hidden then left(btrim(p_reason), 300) else '' end,
        hidden_by = case when p_hidden then auth.uid() else null end,
        updated = now()
    where id = p_id;
  if not found then raise exception 'Avaliação não encontrada.' using errcode = 'P0002'; end if;
end;
$$;

-- As avaliações de um colportor. A equipa (com p_colporteur_id) vê todas, com a encomenda e o
-- primeiro nome do cliente; o próprio (sem p_colporteur_id) vê as visíveis, sem quem as escreveu.
create or replace function public.colporteur_reviews_list(p_colporteur_id uuid default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_staff boolean := false;
begin
  if p_colporteur_id is null then
    select id into v_id from public.colporteurs where profile_id = auth.uid();
    if v_id is null then raise exception 'Esta conta não é de um colportor.' using errcode = '42501'; end if;
  else
    if not private.can_manage_colporteurs() then raise exception 'Sem permissão.' using errcode = '42501'; end if;
    v_id := p_colporteur_id;
    v_staff := true;
  end if;
  return jsonb_build_object(
    'avg', (select round(avg(rating)::numeric, 2) from public.colporteur_reviews where colporteur_id = v_id and not hidden),
    'count', (select count(*) from public.colporteur_reviews where colporteur_id = v_id and not hidden),
    'items', coalesce((
      select jsonb_agg(case when v_staff then jsonb_build_object(
          'id', r.id, 'rating', r.rating, 'comment', r.comment, 'kind', r.kind, 'created', r.created, 'updated', r.updated,
          'hidden', r.hidden, 'hidden_reason', r.hidden_reason, 'order_number', o.order_number,
          'customer', split_part(btrim(coalesce(o.customer_name, '')), ' ', 1))
        else jsonb_build_object('rating', r.rating, 'comment', r.comment, 'kind', r.kind, 'created', r.created) end
        order by r.created desc)
      from public.colporteur_reviews r join public.orders o on o.id = r.order_id
      where r.colporteur_id = v_id and (v_staff or not r.hidden)), '[]'::jsonb)
  );
end;
$$;

-- A média de cada colportor (só as visíveis), para os quadros da equipa.
create or replace function public.colporteur_ratings()
returns table (colporteur_id uuid, rating_avg numeric, rating_count integer)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not (private.can_manage_colporteurs() or private.can_read_church_registry()) then
    raise exception 'Sem permissão.' using errcode = '42501';
  end if;
  return query
    select r.colporteur_id, round(avg(r.rating)::numeric, 2), count(*)::int
    from public.colporteur_reviews r where not r.hidden group by r.colporteur_id;
end;
$$;

-- 5. Igrejas e colportores ---------------------------------------------------------------------
-- Por igreja (todas as activas, ou só p_church_id): colportores activos, candidaturas, por
-- categoria, horas e vendas validadas no ano, entregas feitas no ano e a média das avaliações.
-- Com p_church_id, também a lista dos colportores dessa igreja.
create or replace function public.church_colporteurs(p_church_id uuid default null, p_year integer default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_ano integer := coalesce(p_year, extract(year from now() at time zone 'Africa/Luanda')::int);
  v_ini date := make_date(v_ano, 1, 1);
  v_fim date := make_date(v_ano + 1, 1, 1);
begin
  if not (private.can_manage_colporteurs() or private.can_read_church_registry()) then
    raise exception 'Sem permissão para ver as igrejas e os colportores.' using errcode = '42501';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'church_id', ch.id, 'cn', ch.cn, 'name', ch.name, 'kind', ch.kind, 'active', ch.active,
      'district', d.name, 'district_id', d.id,
      'field', coalesce(nullif(f.short_name, ''), f.name), 'field_id', f.id,
      'active_count', s.activos, 'candidates', s.candidaturas, 'suspended', s.suspensos,
      'by_category', s.categorias,
      'hours', s.horas, 'sales', s.vendas, 'deliveries', s.entregas,
      'rating_avg', s.media, 'rating_count', s.avaliacoes,
      'colporteurs', case when p_church_id is null then null else (
        select coalesce(jsonb_agg(jsonb_build_object(
          'id', c.id, 'code', c.code, 'full_name', c.full_name, 'category', c.category, 'status', c.status,
          'phone', c.phone, 'start_date', c.start_date,
          'store', (select s.name from public.physical_stores s where s.id = c.store_id),
          'rating_avg', (select round(avg(r.rating)::numeric, 2) from public.colporteur_reviews r where r.colporteur_id = c.id and not r.hidden),
          'rating_count', (select count(*) from public.colporteur_reviews r where r.colporteur_id = c.id and not r.hidden))
          order by (c.status = 'activo') desc, c.full_name), '[]'::jsonb)
        from public.colporteurs c where c.church_id = ch.id and c.status <> 'recusado') end
    ) order by f.name nulls last, d.name nulls last, ch.name)
    from public.churches ch
    left join public.church_districts d on d.id = ch.district_id
    left join public.church_fields f on f.id = ch.field_id
    cross join lateral (
      select
        count(*) filter (where c.status = 'activo')::int as activos,
        count(*) filter (where c.status in ('candidatura', 'em_analise'))::int as candidaturas,
        count(*) filter (where c.status = 'suspenso')::int as suspensos,
        coalesce((select jsonb_object_agg(x.category, x.n) from (
          select c2.category, count(*)::int n from public.colporteurs c2
          where c2.church_id = ch.id and c2.status = 'activo' group by c2.category) x), '{}'::jsonb) as categorias,
        coalesce((select sum(rp.hours) from public.colporteur_reports rp join public.colporteurs c3 on c3.id = rp.colporteur_id
          where c3.church_id = ch.id and rp.status = 'validado' and rp.week_start >= v_ini and rp.week_start < v_fim), 0) as horas,
        coalesce((select sum(rp.sales_value) from public.colporteur_reports rp join public.colporteurs c3 on c3.id = rp.colporteur_id
          where c3.church_id = ch.id and rp.status = 'validado' and rp.week_start >= v_ini and rp.week_start < v_fim), 0) as vendas,
        (select count(*)::int from public.colporteur_deliveries dl join public.colporteurs c4 on c4.id = dl.colporteur_id
          where c4.church_id = ch.id and dl.status = 'delivered' and dl.delivered_at >= v_ini and dl.delivered_at < v_fim) as entregas,
        (select round(avg(r.rating)::numeric, 2) from public.colporteur_reviews r join public.colporteurs c5 on c5.id = r.colporteur_id
          where c5.church_id = ch.id and not r.hidden) as media,
        (select count(*)::int from public.colporteur_reviews r join public.colporteurs c5 on c5.id = r.colporteur_id
          where c5.church_id = ch.id and not r.hidden) as avaliacoes
      from public.colporteurs c where c.church_id = ch.id
    ) s
    where (p_church_id is null and ch.active) or ch.id = p_church_id), '[]'::jsonb);
end;
$$;

-- A lista pública do formulário de candidatura, agora com o campo (União/Associação/Missão).
create or replace function public.church_directory()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'churches', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', c.id, 'cn', c.cn, 'name', c.name, 'district_id', c.district_id, 'district', d.name,
        'field', coalesce(nullif(f.short_name, ''), f.name),
        'province_id', c.province_id, 'municipality_id', c.municipality_id) order by c.name)
      from public.churches c
      left join public.church_districts d on d.id = c.district_id
      left join public.church_fields f on f.id = c.field_id
      where c.active), '[]'::jsonb),
    'pastors', coalesce((
      select jsonb_agg(jsonb_build_object('id', p.id, 'label', btrim(p.title || ' ' || p.name), 'district_id', a.district_id) order by p.name)
      from public.pastor_assignments a join public.pastors p on p.id = a.pastor_id
      where a.end_date is null and p.status = 'activo'), '[]'::jsonb),
    'open', coalesce((select applications_open from public.colporteur_settings where id = 1), true),
    'note', coalesce((select application_note from public.colporteur_settings where id = 1), '')
  );
$$;

-- 6. Livros mais vendidos por colportor ou por igreja ------------------------------------------
-- Relatórios validados (vendas à consignação e de livros comprados) e vendas no site com o
-- código do colportor (pagas, não canceladas). A equipa vê qualquer um; o colportor, os seus.
create or replace function public.colporteur_top_books(p_colporteur_id uuid default null, p_church_id uuid default null,
                                                       p_year integer default null, p_limit integer default 6)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_ano integer := coalesce(p_year, extract(year from now() at time zone 'Africa/Luanda')::int);
  v_ini date := make_date(v_ano, 1, 1);
  v_fim date := make_date(v_ano + 1, 1, 1);
  v_me uuid;
begin
  if not (private.can_manage_colporteurs() or private.can_read_church_registry()) then
    select id into v_me from public.colporteurs where profile_id = auth.uid();
    if v_me is null or p_church_id is not null or p_colporteur_id is distinct from v_me then
      raise exception 'Sem permissão.' using errcode = '42501';
    end if;
  end if;
  if p_colporteur_id is null and p_church_id is null then
    raise exception 'Indique o colportor ou a igreja.' using errcode = '22023';
  end if;
  return coalesce((
    with quem as (
      select c.id from public.colporteurs c
      where (p_colporteur_id is not null and c.id = p_colporteur_id)
         or (p_colporteur_id is null and c.church_id = p_church_id)
    ), vendas as (
      select (e ->> 'book_id') as book_id, coalesce((e ->> 'qty')::numeric, 0) as qty
      from public.colporteur_reports rp
      cross join lateral jsonb_array_elements(case when jsonb_typeof(rp.sales) = 'array' then rp.sales else '[]'::jsonb end) e
      where rp.colporteur_id in (select id from quem) and rp.status = 'validado'
        and rp.week_start >= v_ini and rp.week_start < v_fim
      union all
      select (i ->> 'book_id'), coalesce((i ->> 'quantity')::numeric, (i ->> 'qty')::numeric, 0)
      from public.orders o
      cross join lateral jsonb_array_elements(case when jsonb_typeof(o.items) = 'array' then o.items else '[]'::jsonb end) i
      where o.colporteur_id in (select id from quem) and o.payment_status = 'paid'
        and coalesce(o.status, '') not in ('cancelled', 'canceled', 'cancelada')
        and o.created >= v_ini and o.created < v_fim
    ), soma as (
      select v.book_id, sum(v.qty) as qty from vendas v where coalesce(v.book_id, '') <> '' group by v.book_id
    )
    select jsonb_agg(x order by (x ->> 'qty')::numeric desc, x ->> 'title')
    from (
      select jsonb_build_object(
        'book_id', s.book_id, 'qty', s.qty, 'title', coalesce(b.title, 'Livro'),
        'cover', coalesce(nullif(b.cover, ''), nullif(b.cover_image, ''), ''),
        'rating_avg', (select round(avg(r.rating)::numeric, 2) from public.book_reviews r where r.book_id = s.book_id and not r.hidden),
        'rating_count', (select count(*) from public.book_reviews r where r.book_id = s.book_id and not r.hidden)) as x
      from soma s left join public.stock_books b on b.id = s.book_id
      order by s.qty desc
      limit greatest(1, least(coalesce(p_limit, 6), 30))
    ) t), '[]'::jsonb);
end;
$$;

-- 7. Avaliações dos livros: ocultar ----------------------------------------------------------
alter table public.book_reviews
  add column if not exists hidden boolean not null default false,
  add column if not exists hidden_reason text not null default '' check (length(hidden_reason) <= 300);

-- Quem escreveu não muda «hidden»: só book_review_hide (equipa do catálogo).
create or replace function private.book_reviews_oculta_guarda()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce(current_setting('app.review_moderation', true), '') = '1' or auth.role() = 'service_role' then
    return new;
  end if;
  if tg_op = 'INSERT' then
    new.hidden := false;
    new.hidden_reason := '';
  else
    new.hidden := old.hidden;
    new.hidden_reason := old.hidden_reason;
  end if;
  return new;
end;
$$;
revoke all on function private.book_reviews_oculta_guarda() from public, anon, authenticated;
drop trigger if exists book_reviews_oculta_guarda on public.book_reviews;
create trigger book_reviews_oculta_guarda before insert or update on public.book_reviews
  for each row execute function private.book_reviews_oculta_guarda();

drop policy if exists "book_reviews: leitura pública" on public.book_reviews;
create policy "book_reviews: leitura pública" on public.book_reviews for select to anon, authenticated
  using (not hidden or user_id = (select auth.uid()) or (select private.has_permission('manage_catalog')));

create or replace function public.book_review_hide(p_id text, p_hidden boolean, p_reason text default '')
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if not (private.has_permission('manage_catalog') or auth.role() = 'service_role') then
    raise exception 'Sem permissão para moderar as avaliações dos livros.' using errcode = '42501';
  end if;
  if p_hidden and length(btrim(coalesce(p_reason, ''))) < 3 then
    raise exception 'Diga porque oculta a avaliação.' using errcode = '22023';
  end if;
  perform set_config('app.review_moderation', '1', true);
  update public.book_reviews
    set hidden = p_hidden, hidden_reason = case when p_hidden then left(btrim(p_reason), 300) else '' end
    where id = p_id;
  if not found then raise exception 'Avaliação não encontrada.' using errcode = 'P0002'; end if;
  perform set_config('app.review_moderation', '', true);
end;
$$;

-- As avaliações recentes dos livros, para a moderação (equipa do catálogo).
create or replace function public.book_reviews_recent(p_limit integer default 50, p_only_hidden boolean default false)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.has_permission('manage_catalog') then
    raise exception 'Sem permissão.' using errcode = '42501';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', r.id, 'book_id', r.book_id, 'title', coalesce(b.title, 'Livro'),
      'cover', coalesce(nullif(b.cover, ''), nullif(b.cover_image, ''), ''),
      'user_name', r.user_name, 'rating', r.rating, 'comment', r.comment, 'is_verified', r.is_verified,
      'hidden', r.hidden, 'hidden_reason', r.hidden_reason, 'created', r.created) order by r.created desc)
    from (select * from public.book_reviews
          where (not p_only_hidden or hidden)
          order by created desc limit greatest(1, least(coalesce(p_limit, 50), 200))) r
    left join public.stock_books b on b.id = r.book_id), '[]'::jsonb);
end;
$$;

-- Permissões das funções -------------------------------------------------------------------------
do $$
declare f text;
begin
  foreach f in array array[
    'public.colporteur_card(uuid, boolean)',
    'public.colporteur_review_targets(text)',
    'public.colporteur_review_save(text, uuid, integer, text)',
    'public.colporteur_review_hide(uuid, boolean, text)',
    'public.colporteur_reviews_list(uuid)',
    'public.colporteur_ratings()',
    'public.church_colporteurs(uuid, integer)',
    'public.colporteur_top_books(uuid, uuid, integer, integer)',
    'public.book_review_hide(text, boolean, text)',
    'public.book_reviews_recent(integer, boolean)'
  ] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated, service_role', f);
  end loop;
end $$;
revoke all on function public.colporteur_verify(text, text) from public;
grant execute on function public.colporteur_verify(text, text) to anon, authenticated, service_role;
revoke all on function public.church_directory() from public;
grant execute on function public.church_directory() to anon, authenticated, service_role;
