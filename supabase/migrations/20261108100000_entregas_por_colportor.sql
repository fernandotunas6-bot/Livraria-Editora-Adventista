-- Entregas por colportor: a encomenda paga vai ao colportor mais próximo do cliente.
--
-- Decisões do dono (2026-11-08):
--   * Entrega ao domicílio paga → o colportor mais próximo primeiro; se ninguém aceitar no prazo,
--     passa ao seguinte e, no fim, à loja ou à equipa (como antes).
--   * Mais próximo = distância por GPS quando o cliente partilhou a localização no checkout e o
--     colportor registou a dele; senão o município de entrega; senão a província.
--   * O colportor fica com os portes da encomenda (vão para a conta corrente dele).
--   * Só encomendas já pagas (transferência, gateway, balcão). As de pagamento na entrega ficam
--     com a loja: o colportor não recebe dinheiro dos clientes.
--   * Os livros saem do stock do colportor quando ele tem todos à consignação (o sistema faz a
--     guia de devolução sozinho: o livro volta ao stock da loja e sai pela encomenda, e a conta
--     do colportor deixa de lho cobrar); senão ele levanta-os na loja ou na sede.
--   * 2 horas para aceitar, contadas em horário de funcionamento (staff_ops_settings).
--
-- Como corre:
--   1. A encomenda passa a "paga" → gatilho orders_entrega_colportor → private.offer_next_delivery
--      escolhe o primeiro candidato (private.delivery_candidates) e cria a oferta
--      (colporteur_deliveries, 'offered'), com o aviso ao colportor (customer_notifications,
--      tipo 'colportagem'; a Edge Function manda-o por WhatsApp e push).
--   2. O colportor aceita ou recusa pela Edge Function (colporteur_delivery_respond). Recusa ou
--      prazo esgotado (private.colporteur_deliveries_tick, de 5 em 5 minutos) → o seguinte.
--      Sem mais ninguém → orders.delivery_route = 'loja' e aviso à equipa.
--   3. Aceite: do stock dele, sai logo; da loja, a equipa marca "Entregue ao colportor"
--      (colporteur_delivery_handover). Depois "Saiu para entrega" e "Entregue", com o nome e a
--      assinatura de quem recebe (colporteur_delivery_step). Na entrega: portes na conta dele e,
--      se foi do stock dele, a guia de devolução.
--
-- Reverter: drop do gatilho orders_entrega_colportor, das funções colporteur_delivery_* e
-- delivery_*, da tabela colporteur_deliveries, do cron 'entregas-colportores' e das colunas novas.

-- ---------------------------------------------------------------------------
-- 0. Juntar valores a uma regra "coluna in (...)", sem reescrever os que outras migrações já
--    acrescentaram (lê os dois formatos em que o Postgres guarda a regra).
-- ---------------------------------------------------------------------------
create or replace function private.check_list_add(p_table text, p_constraint text, p_column text, p_values text[])
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_def text;
  v_list text[];
  v text;
begin
  select pg_get_constraintdef(c.oid) into v_def
  from pg_constraint c where c.conrelid = p_table::regclass and c.conname = p_constraint;
  select coalesce(array_agg(distinct coalesce(m[1], m[2])), array[]::text[]) into v_list
  from regexp_matches(coalesce(v_def, ''), '''([a-z_]+)''|[{,]([a-z_]+)(?=[,}])', 'g') as m;
  if v_def is not null and cardinality(v_list) = 0 then
    raise exception '% com um formato inesperado: %', p_constraint, v_def;
  end if;
  foreach v in array p_values loop
    if not (v = any (v_list)) then v_list := v_list || v; end if;
  end loop;
  execute format('alter table %s drop constraint if exists %I', p_table, p_constraint);
  execute format('alter table %s add constraint %I check (%I = any (array[%s]))', p_table, p_constraint, p_column,
    (select string_agg(quote_literal(k), ', ' order by k) from unnest(v_list) as k));
end;
$$;
revoke all on function private.check_list_add(text, text, text, text[]) from public, anon, authenticated;

select private.check_list_add('public.customer_notifications', 'customer_notifications_kind_check', 'kind', array['colportagem']);
select private.check_list_add('public.staff_notifications', 'staff_notifications_kind_check', 'kind', array['colporteur_delivery']);
select private.check_list_add('public.colporteur_ledger', 'colporteur_ledger_kind_check', 'kind', array['taxa_entrega']);

-- ---------------------------------------------------------------------------
-- 1. Definições, colportores e encomendas
-- ---------------------------------------------------------------------------
alter table public.colporteur_settings
  add column if not exists deliveries_enabled boolean not null default true,
  add column if not exists delivery_offer_minutes integer not null default 120,
  add column if not exists delivery_near_km integer not null default 15,
  add column if not exists delivery_max_km integer not null default 50;
alter table public.colporteur_settings drop constraint if exists colporteur_settings_delivery_check;
alter table public.colporteur_settings add constraint colporteur_settings_delivery_check
  check (delivery_offer_minutes between 10 and 1440 and delivery_near_km between 1 and 200
         and delivery_max_km between 1 and 500 and delivery_near_km <= delivery_max_km);
comment on column public.colporteur_settings.delivery_offer_minutes is 'Minutos de horário de funcionamento para o colportor aceitar uma entrega.';
comment on column public.colporteur_settings.delivery_near_km is 'Até esta distância (GPS) o colportor ganha a quem está no mesmo município sem GPS.';
comment on column public.colporteur_settings.delivery_max_km is 'Distância máxima (GPS) para oferecer uma entrega fora do município e da província.';

alter table public.colporteurs
  add column if not exists accepts_deliveries boolean not null default true,
  add column if not exists latitude numeric(9,6),
  add column if not exists longitude numeric(9,6),
  add column if not exists location_updated_at timestamptz;
alter table public.colporteurs drop constraint if exists colporteurs_localizacao_check;
alter table public.colporteurs add constraint colporteurs_localizacao_check
  check ((latitude is null) = (longitude is null)
         and (latitude is null or (latitude between -90 and 90 and longitude between -180 and 180)));
comment on column public.colporteurs.latitude is 'Onde o colportor está (registado por ele na sua área), para as entregas por distância.';

alter table public.orders
  add column if not exists delivery_route text not null default '',
  add column if not exists delivery_colporteur_id uuid references public.colporteurs (id) on delete set null;
alter table public.orders drop constraint if exists orders_delivery_route_check;
alter table public.orders add constraint orders_delivery_route_check check (delivery_route in ('', 'colportor', 'loja'));
create index if not exists orders_delivery_colporteur_idx on public.orders (delivery_colporteur_id) where delivery_colporteur_id is not null;
comment on column public.orders.delivery_route is 'Quem entrega: colportor (aceite) ou loja (nenhum colportor, ou a equipa retirou). Vazio = ainda não decidido.';

-- ---------------------------------------------------------------------------
-- 2. Ofertas e entregas
-- ---------------------------------------------------------------------------
create table if not exists public.colporteur_deliveries (
  id uuid primary key default gen_random_uuid(),
  order_id text not null references public.orders (id) on delete cascade,
  colporteur_id uuid not null references public.colporteurs (id) on delete restrict,
  -- offered → accepted | declined | expired | cancelled; accepted → delivered | released | cancelled
  status text not null default 'offered'
    check (status in ('offered', 'accepted', 'declined', 'expired', 'delivered', 'released', 'cancelled')),
  match_level text not null default '' check (match_level in ('', 'gps', 'municipio', 'provincia')),
  distance_km numeric(7,1),
  has_stock boolean not null default false,
  -- De onde saem os livros, decidido ao aceitar: do stock dele ou da loja (levanta-os).
  source text not null default '' check (source in ('', 'stock', 'loja')),
  fee numeric(14,2) not null default 0 check (fee >= 0),
  offered_at timestamptz not null default now(),
  expires_at timestamptz not null,
  responded_at timestamptz,
  picked_up_at timestamptz,
  handed_by uuid,
  delivered_at timestamptz,
  closed_at timestamptz,
  reason text not null default '' check (length(reason) <= 300),
  ledger_id bigint references public.colporteur_ledger (id) on delete set null,
  document_id uuid references public.colporteur_documents (id) on delete set null
);
comment on table public.colporteur_deliveries is
  'Entregas oferecidas aos colportores (uma oferta de cada vez por encomenda) e as que eles aceitaram e fizeram.';
create unique index if not exists colporteur_deliveries_uma_activa on public.colporteur_deliveries (order_id)
  where status in ('offered', 'accepted');
create index if not exists colporteur_deliveries_colporteur_idx on public.colporteur_deliveries (colporteur_id, offered_at desc);
create index if not exists colporteur_deliveries_expira_idx on public.colporteur_deliveries (expires_at) where status = 'offered';
create index if not exists colporteur_deliveries_ledger_idx on public.colporteur_deliveries (ledger_id) where ledger_id is not null;
create index if not exists colporteur_deliveries_document_idx on public.colporteur_deliveries (document_id) where document_id is not null;

alter table public.colporteur_deliveries enable row level security;
revoke all on public.colporteur_deliveries from public, anon, authenticated;
grant select on public.colporteur_deliveries to authenticated;
grant all on public.colporteur_deliveries to service_role;
drop policy if exists "colporteur_deliveries: equipa ou o próprio lê" on public.colporteur_deliveries;
create policy "colporteur_deliveries: equipa ou o próprio lê" on public.colporteur_deliveries
  for select to authenticated using (
    (select private.can_manage_colporteurs()) or (select private.has_permission('manage_orders'))
    or exists (select 1 from public.colporteurs c where c.id = colporteur_id and c.profile_id = (select auth.uid()))
  );

-- ---------------------------------------------------------------------------
-- 3. Ajudantes
-- ---------------------------------------------------------------------------
-- Só a Edge Function (service role): é ela que identifica quem pede e avisa o cliente.
create or replace function private.assert_server()
returns void
language plpgsql
stable
set search_path = ''
as $$
begin
  if coalesce(auth.jwt() ->> 'role', '') <> 'service_role' then
    raise exception 'Esta acção faz-se pelo site.' using errcode = '42501';
  end if;
end;
$$;
revoke all on function private.assert_server() from public, anon, authenticated;

-- Distância em km entre dois pontos (fórmula de haversine). Null se faltar algum.
create or replace function private.km_between(lat1 double precision, lng1 double precision, lat2 double precision, lng2 double precision)
returns double precision
language sql
immutable
set search_path = ''
as $$
  select case when lat1 is null or lng1 is null or lat2 is null or lng2 is null then null
    else 6371 * 2 * asin(least(1, sqrt(power(sin(radians(lat2 - lat1) / 2), 2)
         + cos(radians(lat1)) * cos(radians(lat2)) * power(sin(radians(lng2 - lng1) / 2), 2)))) end;
$$;
revoke all on function private.km_between(double precision, double precision, double precision, double precision) from public, anon, authenticated;

-- Prazo em minutos de horário de funcionamento (Luanda): uma oferta feita às 17h50 de sexta,
-- com 120 minutos, acaba às 9h50 de sábado (com o horário de seg–sáb, 8h–18h).
create or replace function private.business_deadline(p_from timestamptz, p_minutes integer)
returns timestamptz
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  s public.staff_ops_settings;
  v_local timestamp := p_from at time zone 'Africa/Luanda';
  v_left numeric := greatest(coalesce(p_minutes, 0), 0);
  v_day date;
  v_open timestamp;
  v_close timestamp;
  v_take numeric;
begin
  select * into s from public.staff_ops_settings where id = 1;
  if s.id is null or coalesce(cardinality(s.open_days), 0) = 0 then
    return p_from + make_interval(mins => coalesce(p_minutes, 0));
  end if;
  for i in 1..21 loop
    v_day := v_local::date;
    v_open := v_day + make_interval(hours => s.open_hour);
    v_close := v_day + make_interval(hours => s.close_hour);
    if extract(isodow from v_day)::smallint = any (s.open_days) and v_local < v_close then
      if v_local < v_open then v_local := v_open; end if;
      v_take := extract(epoch from (v_close - v_local)) / 60;
      if v_left <= v_take then
        return (v_local + make_interval(secs => (v_left * 60)::double precision)) at time zone 'Africa/Luanda';
      end if;
      v_left := v_left - v_take;
    end if;
    v_local := (v_day + 1)::timestamp;
  end loop;
  return p_from + make_interval(mins => coalesce(p_minutes, 0));
end;
$$;
revoke all on function private.business_deadline(timestamptz, integer) from public, anon, authenticated;

-- O colportor tem à consignação todos os livros da encomenda? (Produtos com tamanhos não
-- entram em guias, por isso uma encomenda com eles sai sempre da loja.)
create or replace function private.colporteur_has_items(p_colporteur uuid, p_items jsonb)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    jsonb_typeof(p_items) = 'array' and jsonb_array_length(p_items) > 0
    and bool_and((it ->> 'variant') is null
                 and private.colporteur_in_hand(p_colporteur, it ->> 'book_id') >= greatest(coalesce((it ->> 'quantity')::int, 1), 1)),
    false)
  from jsonb_array_elements(case when jsonb_typeof(p_items) = 'array' then p_items else '[]'::jsonb end) it;
$$;
revoke all on function private.colporteur_has_items(uuid, jsonb) from public, anon, authenticated;

-- A encomenda pode ir a um colportor: paga, entrega ao domicílio (normal ou expressa), ainda
-- não saiu, não cancelada, e ninguém decidiu ainda quem entrega.
create or replace function private.delivery_eligible(o public.orders)
returns boolean
language sql
stable
set search_path = ''
as $$
  select o.payment_status = 'paid'
     and coalesce(o.shipping_method, '') in ('delivery', 'express')
     and coalesce(o.status, '') <> 'cancelled'
     and coalesce(o.delivery_status, '') in ('', 'received', 'confirmed', 'preparing')
     and coalesce(o.delivery_route, '') = ''
     and o.delivery_colporteur_id is null;
$$;
revoke all on function private.delivery_eligible(public.orders) from public, anon, authenticated;

-- Candidatos por ordem: muito perto por GPS; mesmo município; perto por GPS (até ao máximo);
-- mesma província. Em cada nível, primeiro quem tem os livros, depois o mais perto, o menos
-- ocupado e quem recebeu uma oferta há mais tempo. Nunca o mesmo colportor duas vezes, nem o
-- próprio cliente.
create or replace function private.delivery_candidates(p_order_id text)
returns table (colporteur_id uuid, km double precision, level text, has_stock boolean)
language sql
stable
security definer
set search_path = ''
as $$
  with o as (select * from public.orders where id = p_order_id),
  cfg as (
    select coalesce(max(delivery_near_km), 15) as near_km, coalesce(max(delivery_max_km), 50) as max_km
    from public.colporteur_settings where id = 1
  ),
  c as (
    select c.id,
      case when (coalesce(o.delivery_gps_lat, 0) <> 0 or coalesce(o.delivery_gps_lng, 0) <> 0)
                and c.latitude is not null and c.longitude is not null
           then private.km_between(o.delivery_gps_lat, o.delivery_gps_lng, c.latitude::double precision, c.longitude::double precision)
      end as km,
      coalesce(c.municipality_id, '') <> '' and c.municipality_id = o.delivery_municipality_id as same_mun,
      coalesce(c.province_id, '') <> '' and c.province_id = o.delivery_province_id as same_prov,
      private.colporteur_has_items(c.id, o.items) as has_stock,
      (select count(*) from public.colporteur_deliveries d where d.colporteur_id = c.id and d.status = 'accepted') as busy,
      (select max(d.offered_at) from public.colporteur_deliveries d where d.colporteur_id = c.id) as last_offer
    from public.colporteurs c, o
    where c.status = 'activo' and c.code is not null and c.profile_id is not null and c.accepts_deliveries
      and c.profile_id is distinct from o.customer_id
      and not exists (select 1 from public.colporteur_deliveries d where d.order_id = o.id and d.colporteur_id = c.id)
  )
  select c.id, c.km,
    case when c.km is not null and c.km <= cfg.near_km then 'gps'
         when c.same_mun then 'municipio'
         when c.km is not null and c.km <= cfg.max_km then 'gps'
         else 'provincia' end,
    c.has_stock
  from c, cfg
  where (c.km is not null and c.km <= cfg.max_km) or c.same_mun or c.same_prov
  order by case when c.km is not null and c.km <= cfg.near_km then 0
                when c.same_mun then 1
                when c.km is not null and c.km <= cfg.max_km then 2
                else 3 end,
           c.has_stock desc, c.km asc nulls last, c.busy asc, c.last_offer asc nulls first;
$$;
revoke all on function private.delivery_candidates(text) from public, anon, authenticated;

-- Aviso na conta do colportor (sino e, pela Edge Function, WhatsApp e push).
create or replace function private.notify_colporteur(p_colporteur uuid, p_title text, p_body text, p_order_id text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_profile uuid := (select profile_id from public.colporteurs where id = p_colporteur);
begin
  if v_profile is null then return; end if;
  insert into public.customer_notifications (customer_id, kind, title, body, href, order_id)
  values (v_profile, 'colportagem', left(p_title, 120), left(coalesce(nullif(btrim(p_body), ''), '—'), 500),
          '/colportor?tab=entregas', p_order_id);
end;
$$;
revoke all on function private.notify_colporteur(uuid, text, text, text) from public, anon, authenticated;

-- Onde é a entrega, para a oferta (sem dados do cliente).
create or replace function private.order_place(o public.orders)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(nullif(concat_ws(', ', nullif(o.delivery_locality, ''), nullif(o.delivery_municipality, ''),
                                   nullif(o.delivery_province, '')), ''), nullif(o.city, ''), 'morada do cliente');
$$;
revoke all on function private.order_place(public.orders) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4. Oferecer ao seguinte (ou passar à loja)
-- ---------------------------------------------------------------------------
create or replace function private.offer_next_delivery(p_order_id text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.orders;
  v_cfg public.colporteur_settings;
  v_cand record;
  v_tried integer;
  v_expires timestamptz;
  v_ref text;
begin
  select * into v_cfg from public.colporteur_settings where id = 1;
  if not coalesce(v_cfg.deliveries_enabled, false) then return 'disabled'; end if;
  select * into v_order from public.orders where id = p_order_id for update;
  if not found or not private.delivery_eligible(v_order) then return 'ineligible'; end if;
  if exists (select 1 from public.colporteur_deliveries where order_id = p_order_id and status in ('offered', 'accepted')) then
    return 'already';
  end if;
  v_ref := coalesce(nullif(v_order.order_number, ''), v_order.id);

  select * into v_cand from private.delivery_candidates(p_order_id) limit 1;
  if v_cand.colporteur_id is null then
    -- Ninguém (mais) perto: a loja ou a equipa entrega, como antes.
    update public.orders set delivery_route = 'loja' where id = p_order_id;
    v_tried := (select count(*) from public.colporteur_deliveries where order_id = p_order_id);
    perform private.notify_staff('delivery', private.order_store_id(v_order.shipping_method, v_order.pickup_store),
      'colporteur_delivery', 'Entrega pela equipa — ' || v_ref,
      case when v_tried = 0
        then 'Nenhum colportor activo perto de ' || private.order_place(v_order) || '. A encomenda está paga: a equipa entrega.'
        else 'Nenhum dos ' || v_tried || ' colportor(es) a quem foi oferecida a aceitou. A encomenda está paga: a equipa entrega.' end,
      p_order_id, null, 'high');
    return 'loja';
  end if;

  v_expires := private.business_deadline(now(), v_cfg.delivery_offer_minutes);
  insert into public.colporteur_deliveries (order_id, colporteur_id, status, match_level, distance_km, has_stock, fee, offered_at, expires_at)
  values (p_order_id, v_cand.colporteur_id, 'offered', v_cand.level,
          case when v_cand.km is not null then round(v_cand.km::numeric, 1) end,
          v_cand.has_stock, coalesce(v_order.shipping_cost, 0), now(), v_expires);
  perform private.notify_colporteur(v_cand.colporteur_id, 'Entrega para si — ' || v_ref,
    'Encomenda paga em ' || private.order_place(v_order)
      || case when v_cand.km is not null then ' (a ' || round(v_cand.km::numeric, 1) || ' km)' else '' end
      || case when coalesce(v_order.shipping_cost, 0) > 0 then '. Ganha os portes: ' || private.kz(v_order.shipping_cost) else '. Envio grátis: sem portes' end
      || case when v_cand.has_stock then '. Tem os livros consigo' else '. Os livros levantam-se na loja' end
      || '. Aceite até ' || to_char(v_expires at time zone 'Africa/Luanda', 'DD/MM "às" HH24:MI') || '.',
    p_order_id);
  return 'offered';
end;
$$;
revoke all on function private.offer_next_delivery(text) from public, anon, authenticated;

-- A encomenda ficou paga → oferece. Foi cancelada → as ofertas e entregas em curso acabam.
create or replace function private.orders_entrega_colportor()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  r record;
begin
  if new.payment_status = 'paid' and old.payment_status is distinct from 'paid' then
    perform private.offer_next_delivery(new.id);
  end if;
  if (coalesce(new.status, '') = 'cancelled' or new.delivery_status = 'cancelled')
     and not (coalesce(old.status, '') = 'cancelled' or old.delivery_status = 'cancelled') then
    for r in
      update public.colporteur_deliveries set status = 'cancelled', closed_at = now(), reason = 'A encomenda foi cancelada.'
      where order_id = new.id and status in ('offered', 'accepted')
      returning colporteur_id
    loop
      perform private.notify_colporteur(r.colporteur_id, 'Entrega cancelada — ' || coalesce(nullif(new.order_number, ''), new.id),
        'A encomenda foi cancelada: já não é para entregar.', new.id);
    end loop;
  end if;
  return null;
end;
$$;
revoke all on function private.orders_entrega_colportor() from public, anon, authenticated;
drop trigger if exists orders_entrega_colportor on public.orders;
create trigger orders_entrega_colportor
  after update of payment_status, status, delivery_status on public.orders
  for each row execute function private.orders_entrega_colportor();

-- ---------------------------------------------------------------------------
-- 5. O colportor aceita, recusa, sai, entrega ou desiste (pela Edge Function)
-- ---------------------------------------------------------------------------
create or replace function public.colporteur_delivery_respond(p_delivery uuid, p_profile uuid, p_accept boolean, p_reason text default '')
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_d public.colporteur_deliveries;
  v_c public.colporteurs;
  v_o public.orders;
  v_source text;
  v_ref text;
  v_next text;
begin
  perform private.assert_server();
  select * into v_d from public.colporteur_deliveries where id = p_delivery for update;
  if not found then raise exception 'Entrega não encontrada.'; end if;
  select * into v_c from public.colporteurs where id = v_d.colporteur_id;
  if v_c.profile_id is distinct from p_profile then raise exception 'Esta entrega não é sua.' using errcode = '42501'; end if;
  select * into v_o from public.orders where id = v_d.order_id for update;
  v_ref := coalesce(nullif(v_o.order_number, ''), v_o.id);
  if v_d.status <> 'offered' then raise exception 'Esta entrega já não está à sua espera.'; end if;
  if v_d.expires_at < now() then
    update public.colporteur_deliveries set status = 'expired', closed_at = now() where id = p_delivery;
    v_next := private.offer_next_delivery(v_o.id);
    return jsonb_build_object('order_id', v_o.id, 'status', 'expired', 'next', v_next);
  end if;

  if not coalesce(p_accept, false) then
    update public.colporteur_deliveries set status = 'declined', responded_at = now(), closed_at = now(),
      reason = left(btrim(coalesce(p_reason, '')), 300) where id = p_delivery;
    v_next := private.offer_next_delivery(v_o.id);
    return jsonb_build_object('order_id', v_o.id, 'status', 'declined', 'next', v_next);
  end if;

  if v_c.status <> 'activo' then raise exception 'Só um colportor activo aceita entregas.'; end if;
  v_source := case when private.colporteur_has_items(v_c.id, v_o.items) then 'stock' else 'loja' end;
  update public.colporteur_deliveries set status = 'accepted', responded_at = now(), source = v_source where id = p_delivery;
  update public.orders
  set delivery_colporteur_id = v_c.id, delivery_route = 'colportor',
      delivery_status = case when coalesce(delivery_status, '') in ('', 'received') then 'confirmed' else delivery_status end
  where id = v_o.id;
  perform private.notify_staff(case when v_source = 'loja' then 'preparation' else 'delivery' end,
    private.order_store_id(v_o.shipping_method, v_o.pickup_store), 'colporteur_delivery',
    case when v_source = 'loja' then 'Preparar para o colportor — ' || v_ref else 'Colportor entrega do stock dele — ' || v_ref end,
    v_c.full_name || ' (' || coalesce(v_c.code, '—') || ', ' || v_c.phone || ') aceitou entregar a encomenda '
      || v_ref || ' em ' || private.order_place(v_o)
      || case when v_source = 'loja'
           then '. Prepare os livros para ele levantar e marque "Entregue ao colportor" na encomenda.'
           else ', com os livros que tem à consignação.' end,
    v_o.id, null, case when v_source = 'loja' then 'high' else 'normal' end);
  return jsonb_build_object('order_id', v_o.id, 'status', 'accepted', 'source', v_source,
                            'previous_delivery_status', coalesce(v_o.delivery_status, ''));
end;
$$;

-- Guia de devolução automática: os livros da encomenda saem do stock do colportor, voltam ao
-- stock da loja (que já os tinha descontado ao encomendar) e deixam de lhe ser cobrados.
-- Igual a colporteur_issue_document('devolucao'), sem a permissão da equipa: corre só a partir
-- da entrega confirmada.
create or replace function private.colporteur_return_for_order(p_colporteur uuid, p_order public.orders, p_actor uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_it jsonb;
  v_book public.stock_books;
  v_qty integer;
  v_price numeric;
  v_lines jsonb := '[]'::jsonb;
  v_total numeric := 0;
  v_doc uuid;
  v_number text;
begin
  v_number := private.formata_codigo('GUI-', private.codigo_seguinte('GUI-'));
  insert into public.colporteur_documents (number, colporteur_id, kind, notes, created_by)
  values (v_number, p_colporteur, 'devolucao',
          'Entregue ao cliente na encomenda ' || coalesce(nullif(p_order.order_number, ''), p_order.id) || ' (automática).', p_actor)
  returning id into v_doc;
  perform set_config('app.stock_reason', 'devolucao_consignacao', true);
  perform set_config('app.stock_ref', v_number, true);
  for v_it in select * from jsonb_array_elements(p_order.items) loop
    v_qty := greatest(coalesce((v_it ->> 'quantity')::int, 1), 1);
    select * into v_book from public.stock_books where id = v_it ->> 'book_id' for update;
    if v_book.id is null then raise exception 'Produto da encomenda não encontrado.'; end if;
    if private.colporteur_in_hand(p_colporteur, v_book.id) < v_qty then
      raise exception 'Já não tem à consignação % de "%". Levante os livros na loja ou fale com a equipa.', v_qty, v_book.title;
    end if;
    v_price := round(coalesce(v_book.price, 0)::numeric, 2);
    update public.stock_books set stock = coalesce(stock, 0) + v_qty where id = v_book.id;
    insert into public.colporteur_stock_moves (colporteur_id, book_id, qty, kind, unit_price, document_id, actor)
    values (p_colporteur, v_book.id, -v_qty, 'devolucao', v_price, v_doc, p_actor);
    v_total := v_total + v_price * v_qty;
    v_lines := v_lines || jsonb_build_object('book_id', v_book.id, 'book_code', v_book.book_code, 'title', v_book.title,
      'qty', v_qty, 'unit_price', v_price, 'pct', null);
  end loop;
  perform set_config('app.stock_reason', '', true);
  perform set_config('app.stock_ref', '', true);
  update public.colporteur_documents set lines = v_lines, total_value = v_total, amount = -v_total where id = v_doc;
  insert into public.colporteur_ledger (colporteur_id, kind, amount, description, document_id, actor)
  values (p_colporteur, 'devolucao', -v_total, v_number || ' · entrega da encomenda ' || coalesce(nullif(p_order.order_number, ''), p_order.id), v_doc, p_actor);
  return v_doc;
end;
$$;
revoke all on function private.colporteur_return_for_order(uuid, public.orders, uuid) from public, anon, authenticated;

create or replace function public.colporteur_delivery_step(
  p_delivery uuid, p_profile uuid, p_step text,
  p_recipient_name text default '', p_recipient_id text default '', p_signature text default '', p_reason text default ''
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_d public.colporteur_deliveries;
  v_c public.colporteurs;
  v_o public.orders;
  v_ref text;
  v_doc uuid;
  v_ledger bigint;
  v_name text := left(btrim(coalesce(p_recipient_name, '')), 120);
  v_next text;
begin
  perform private.assert_server();
  select * into v_d from public.colporteur_deliveries where id = p_delivery for update;
  if not found then raise exception 'Entrega não encontrada.'; end if;
  select * into v_c from public.colporteurs where id = v_d.colporteur_id;
  if v_c.profile_id is distinct from p_profile then raise exception 'Esta entrega não é sua.' using errcode = '42501'; end if;
  if v_d.status <> 'accepted' then raise exception 'Esta entrega já não está consigo.'; end if;
  select * into v_o from public.orders where id = v_d.order_id for update;
  v_ref := coalesce(nullif(v_o.order_number, ''), v_o.id);
  if coalesce(v_o.status, '') = 'cancelled' or v_o.delivery_status = 'cancelled' then
    raise exception 'A encomenda foi cancelada: não entregue.';
  end if;

  if p_step = 'out_for_delivery' then
    if v_d.source = 'loja' and v_d.picked_up_at is null then
      raise exception 'Levante primeiro os livros na loja: a equipa marca a entrega ao colportor.';
    end if;
    update public.orders set delivery_status = 'out_for_delivery' where id = v_o.id;

  elsif p_step = 'delivered' then
    if length(v_name) < 2 then raise exception 'Escreva o nome de quem recebeu.'; end if;
    if coalesce(p_signature, '') !~ '^data:image/png;base64,' or length(p_signature) > 300000 then
      raise exception 'Falta a assinatura de quem recebeu.';
    end if;
    if v_d.source = 'loja' and v_d.picked_up_at is null then
      raise exception 'A equipa ainda não marcou os livros como entregues a si.';
    end if;
    if v_d.source = 'stock' then
      v_doc := private.colporteur_return_for_order(v_c.id, v_o, p_profile);
    end if;
    if v_d.fee > 0 then
      insert into public.colporteur_ledger (colporteur_id, kind, amount, description, order_id, actor)
      values (v_c.id, 'taxa_entrega', -v_d.fee, 'Portes da entrega · ' || v_ref, v_o.id, p_profile)
      returning id into v_ledger;
    end if;
    update public.orders
    set delivery_status = 'delivered', delivery_confirmed_at = now(), delivery_confirmed_by = v_name,
        delivery_recipient_name = v_name, delivery_recipient_id = left(btrim(coalesce(p_recipient_id, '')), 60),
        delivery_signature_data = p_signature
    where id = v_o.id;
    update public.colporteur_deliveries set status = 'delivered', delivered_at = now(), closed_at = now(),
      ledger_id = v_ledger, document_id = v_doc where id = p_delivery;

  elsif p_step = 'release' then
    if v_d.source = 'loja' and v_d.picked_up_at is not null then
      raise exception 'Já levantou os livros: devolva-os na loja e peça à equipa para retirar a entrega.';
    end if;
    update public.colporteur_deliveries set status = 'released', closed_at = now(),
      reason = left(coalesce(nullif(btrim(p_reason), ''), 'Desistiu.'), 300) where id = p_delivery;
    update public.orders set delivery_colporteur_id = null, delivery_route = '' where id = v_o.id;
    v_next := private.offer_next_delivery(v_o.id);
    perform private.notify_staff('delivery', null, 'colporteur_delivery', 'Colportor desistiu — ' || v_ref,
      v_c.full_name || ' desistiu da entrega' || coalesce(': ' || nullif(btrim(p_reason), ''), '') || '. '
        || case v_next when 'offered' then 'Foi oferecida ao colportor seguinte.' else 'Passou para a equipa.' end,
      v_o.id, null, 'high');
  else
    raise exception 'Passo inválido.';
  end if;

  return jsonb_build_object('order_id', v_o.id, 'step', p_step, 'next', v_next, 'document_id', v_doc, 'ledger_id', v_ledger);
end;
$$;

-- ---------------------------------------------------------------------------
-- 6. A equipa: entregou os livros ao colportor, ou retira-lhe a entrega
-- ---------------------------------------------------------------------------
create or replace function public.colporteur_delivery_handover(p_delivery uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_d public.colporteur_deliveries;
  v_o public.orders;
begin
  perform private.assert_server();
  select * into v_d from public.colporteur_deliveries where id = p_delivery for update;
  if not found or v_d.status <> 'accepted' then raise exception 'Esta entrega não está aceite por um colportor.'; end if;
  if v_d.picked_up_at is not null then raise exception 'Os livros já foram entregues ao colportor.'; end if;
  select * into v_o from public.orders where id = v_d.order_id for update;
  update public.colporteur_deliveries set picked_up_at = now(), handed_by = (select a.actor_id from private.audit_actor() a)
  where id = p_delivery;
  update public.orders set delivery_status = 'shipped'
  where id = v_o.id and coalesce(delivery_status, '') in ('', 'received', 'confirmed', 'preparing');
  perform private.notify_colporteur(v_d.colporteur_id, 'Livros entregues — ' || coalesce(nullif(v_o.order_number, ''), v_o.id),
    'A equipa marcou os livros da encomenda como entregues a si. Quando sair, marque "Saiu para entrega".', v_o.id);
  return jsonb_build_object('order_id', v_o.id, 'previous_delivery_status', coalesce(v_o.delivery_status, ''));
end;
$$;

create or replace function public.colporteur_delivery_take_back(p_delivery uuid, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_d public.colporteur_deliveries;
  v_o public.orders;
  v_reason text := left(btrim(coalesce(p_reason, '')), 280);
begin
  perform private.assert_server();
  if length(v_reason) < 5 then raise exception 'Diga ao colportor porque lhe retira a entrega.'; end if;
  select * into v_d from public.colporteur_deliveries where id = p_delivery for update;
  if not found or v_d.status not in ('offered', 'accepted') then raise exception 'Esta entrega já não está com um colportor.'; end if;
  select * into v_o from public.orders where id = v_d.order_id for update;
  update public.colporteur_deliveries set status = 'released', closed_at = now(), reason = 'Retirada pela equipa: ' || v_reason
  where id = p_delivery;
  update public.orders set delivery_colporteur_id = null, delivery_route = 'loja' where id = v_o.id;
  perform private.notify_colporteur(v_d.colporteur_id, 'Entrega retirada — ' || coalesce(nullif(v_o.order_number, ''), v_o.id),
    'A equipa vai fazer esta entrega: ' || v_reason, v_o.id);
  return jsonb_build_object('order_id', v_o.id);
end;
$$;

do $$
declare f text;
begin
  foreach f in array array[
    'public.colporteur_delivery_respond(uuid, uuid, boolean, text)',
    'public.colporteur_delivery_step(uuid, uuid, text, text, text, text, text)',
    'public.colporteur_delivery_handover(uuid)',
    'public.colporteur_delivery_take_back(uuid, text)'
  ] loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
end
$$;

-- ---------------------------------------------------------------------------
-- 7. Localização e disponibilidade (o próprio colportor, na sua área)
-- ---------------------------------------------------------------------------
create or replace function public.colporteur_set_location(p_lat double precision, p_lng double precision)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if p_lat is null or p_lng is null then raise exception 'Localização em falta.'; end if;
  -- Angola fica entre as latitudes -18,1 e -4,3 e as longitudes 11,6 e 24,1 (com folga).
  if p_lat not between -18.6 and -4.0 or p_lng not between 11.3 and 24.5 then
    raise exception 'Essa localização fica fora de Angola. Registe-a no sítio onde costuma estar.';
  end if;
  update public.colporteurs set latitude = round(p_lat::numeric, 6), longitude = round(p_lng::numeric, 6),
    location_updated_at = now(), updated = now()
  where profile_id = auth.uid() and status = 'activo'
  returning id into v_id;
  if v_id is null then raise exception 'Só um colportor activo regista a localização.' using errcode = '42501'; end if;
  return jsonb_build_object('latitude', round(p_lat::numeric, 6), 'longitude', round(p_lng::numeric, 6), 'at', now());
end;
$$;

create or replace function public.colporteur_set_accepts_deliveries(p_on boolean)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  update public.colporteurs set accepts_deliveries = coalesce(p_on, false), updated = now()
  where profile_id = auth.uid() and code is not null
  returning id into v_id;
  if v_id is null then raise exception 'Só um colportor muda esta opção.' using errcode = '42501'; end if;
  return coalesce(p_on, false);
end;
$$;
revoke all on function public.colporteur_set_location(double precision, double precision) from public, anon;
revoke all on function public.colporteur_set_accepts_deliveries(boolean) from public, anon;
grant execute on function public.colporteur_set_location(double precision, double precision) to authenticated;
grant execute on function public.colporteur_set_accepts_deliveries(boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- 8. Leitura: as entregas do colportor e as de uma encomenda (painel)
-- ---------------------------------------------------------------------------
-- O colportor vê os dados do cliente (nome, telefone, morada, coordenadas) só depois de aceitar.
create or replace function public.colporteur_my_deliveries()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_c public.colporteurs;
begin
  select * into v_c from public.colporteurs where profile_id = auth.uid();
  if v_c.id is null then raise exception 'Sem acesso.' using errcode = '42501'; end if;
  return jsonb_build_object(
    'accepts_deliveries', v_c.accepts_deliveries,
    'latitude', v_c.latitude, 'longitude', v_c.longitude, 'location_updated_at', v_c.location_updated_at,
    'deliveries', coalesce((
      select jsonb_agg(x order by x ->> 'sort' desc) from (
        select jsonb_build_object(
          'sort', case when d.status in ('offered', 'accepted') then '1' else '0' end || to_char(d.offered_at, 'YYYYMMDDHH24MISS'),
          'id', d.id, 'status', d.status, 'source', d.source, 'has_stock', d.has_stock, 'fee', d.fee,
          'distance_km', d.distance_km, 'match_level', d.match_level, 'offered_at', d.offered_at, 'expires_at', d.expires_at,
          'picked_up_at', d.picked_up_at, 'delivered_at', d.delivered_at, 'reason', d.reason,
          'order_number', coalesce(nullif(o.order_number, ''), o.id), 'total', o.total, 'delivery_status', o.delivery_status,
          'place', private.order_place(o),
          'items', (select coalesce(jsonb_agg(jsonb_build_object('title', it ->> 'title', 'qty', (it ->> 'quantity')::int,
                                                                'code', it ->> 'book_code', 'variant', it ->> 'variant_label')), '[]'::jsonb)
                    from jsonb_array_elements(case when jsonb_typeof(o.items) = 'array' then o.items else '[]'::jsonb end) it),
          'customer', case when d.status = 'accepted' then jsonb_build_object(
              'name', o.customer_name, 'phone', o.phone, 'address', o.delivery_address_full, 'street', o.delivery_street,
              'reference', o.delivery_reference, 'locality', o.delivery_locality, 'municipality', o.delivery_municipality,
              'province', o.delivery_province, 'relative_name', o.delivery_relative_name, 'relative_phone', o.delivery_relative_phone,
              'notes', o.notes,
              'gps', case when coalesce(o.delivery_gps_lat, 0) <> 0 or coalesce(o.delivery_gps_lng, 0) <> 0
                          then jsonb_build_object('lat', o.delivery_gps_lat, 'lng', o.delivery_gps_lng) end)
            end
        ) as x
        from public.colporteur_deliveries d join public.orders o on o.id = d.order_id
        where d.colporteur_id = v_c.id
          and (d.status in ('offered', 'accepted') or d.closed_at > now() - interval '30 days')
        order by d.offered_at desc
        limit 50
      ) s), '[]'::jsonb)
  );
end;
$$;
revoke all on function public.colporteur_my_deliveries() from public, anon;
grant execute on function public.colporteur_my_deliveries() to authenticated;

create or replace function public.order_colporteur_deliveries(p_order_id text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not (private.has_permission('manage_orders') or private.can_manage_colporteurs()) then
    raise exception 'Sem acesso.' using errcode = '42501';
  end if;
  return (
    select jsonb_build_object(
      'route', o.delivery_route,
      'deliveries', coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', d.id, 'status', d.status, 'source', d.source, 'has_stock', d.has_stock, 'fee', d.fee,
          'distance_km', d.distance_km, 'match_level', d.match_level, 'offered_at', d.offered_at, 'expires_at', d.expires_at,
          'responded_at', d.responded_at, 'picked_up_at', d.picked_up_at, 'delivered_at', d.delivered_at, 'reason', d.reason,
          'colporteur', jsonb_build_object('id', c.id, 'name', c.full_name, 'code', c.code, 'phone', c.phone)
        ) order by d.offered_at)
        from public.colporteur_deliveries d join public.colporteurs c on c.id = d.colporteur_id
        where d.order_id = o.id), '[]'::jsonb))
    from public.orders o where o.id = p_order_id
  );
end;
$$;
revoke all on function public.order_colporteur_deliveries(text) from public, anon;
grant execute on function public.order_colporteur_deliveries(text) to authenticated;

-- ---------------------------------------------------------------------------
-- 9. Prazos (de 5 em 5 minutos) e o envio dos avisos aos colportores
-- ---------------------------------------------------------------------------
create or replace function private.colporteur_deliveries_tick()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  r record;
  v_n integer := 0;
begin
  for r in
    select id, order_id, colporteur_id from public.colporteur_deliveries
    where status = 'offered' and expires_at < now()
    order by expires_at limit 50
    for update skip locked
  loop
    update public.colporteur_deliveries set status = 'expired', closed_at = now() where id = r.id;
    perform private.offer_next_delivery(r.order_id);
    v_n := v_n + 1;
  end loop;
  -- Pagas enquanto as entregas por colportor estavam desligadas, ou antes desta migração.
  for r in
    select o.id from public.orders o
    where o.payment_status = 'paid' and o.delivery_route = '' and o.delivery_colporteur_id is null
      and coalesce(o.shipping_method, '') in ('delivery', 'express') and coalesce(o.status, '') <> 'cancelled'
      and coalesce(o.delivery_status, '') in ('', 'received', 'confirmed') and o.paid_at > now() - interval '7 days'
      and not exists (select 1 from public.colporteur_deliveries d where d.order_id = o.id and d.status in ('offered', 'accepted'))
    limit 20
  loop
    if private.offer_next_delivery(r.id) in ('offered', 'loja') then v_n := v_n + 1; end if;
  end loop;
  return v_n;
end;
$$;
revoke all on function private.colporteur_deliveries_tick() from public, anon, authenticated;

do $$
begin
  if exists (select 1 from cron.job where jobname = 'entregas-colportores') then
    perform cron.unschedule('entregas-colportores');
  end if;
  perform cron.schedule('entregas-colportores', '*/5 * * * *', 'select private.colporteur_deliveries_tick()');
end
$$;

-- O agendador dos avisos (20261107060000) passa a acordar também para os avisos dos colportores.
create or replace function private.run_staff_dispatch()
returns void
language plpgsql
security definer
set search_path = net, extensions
as $$
declare
  v_queue_url text;
  v_token text;
  v_open boolean;
  v_local timestamp := now() at time zone 'Africa/Luanda';
begin
  select (extract(isodow from v_local)::smallint = any (s.open_days)
          and extract(hour from v_local) >= s.open_hour
          and extract(hour from v_local) < s.close_hour)
  into v_open
  from public.staff_ops_settings s where s.id = 1;
  v_open := coalesce(v_open, true);

  -- Com a loja fechada, só o crítico sai para a equipa (o resto espera pela abertura); as
  -- respostas aos clientes, os avisos da comunidade e os dos colportores saem a qualquer hora.
  if not exists (
    select 1 from public.staff_notifications n
    where n.dispatched_at is null and n.created_at > now() - interval '2 days'
      and (v_open or n.severity = 'critical')
  ) and not exists (
    select 1 from public.customer_notifications c
    where c.dispatched_at is null and c.kind in ('support', 'colportagem') and c.created_at > now() - interval '2 days'
  ) and not exists (
    select 1 from public.customer_notifications c
    where c.dispatched_at is null and c.kind = 'community' and c.created_at > now() - interval '2 days'
      and (c.title <> 'Gostaram da sua publicação' or c.created_at < now() - interval '30 minutes')
  ) then
    return;
  end if;

  select decrypted_secret into v_queue_url from vault.decrypted_secrets where name = 'email_queue_url' limit 1;
  select decrypted_secret into v_token from vault.decrypted_secrets where name = 'email_queue_token' limit 1;
  if v_queue_url is null or v_token is null then
    raise notice 'Avisos: faltam os segredos email_queue_url/email_queue_token no Vault.';
    return;
  end if;
  perform http_post(
    url := regexp_replace(v_queue_url, '(/functions/v1/app).*$', '\1') || '/cron/staff-dispatch',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-queue-token', v_token),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
end;
$$;
