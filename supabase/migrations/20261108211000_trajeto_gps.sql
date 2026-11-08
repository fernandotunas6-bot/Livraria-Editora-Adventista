-- Trajeto da encomenda com GPS dos dois lados: quem entrega e quem recebe.
--
-- Pedido do dono (2026-11-08): "refinar também o trajeto da encomenda, GPS refinado dos dois
-- lados, de quem recebe e de quem envia". Como fazem as entregas com estafeta (Glovo, Uber Eats,
-- Bolt Food, Yango): quem entrega partilha a posição enquanto vai a caminho; quem recebe vê-a no
-- mapa, com a distância e o tempo estimado, e afina o ponto onde quer receber.
--
--   1. Quem recebe: o ponto de entrega (orders.delivery_gps_lat/lng, do checkout) ganha a
--      precisão e a hora (delivery_gps_accuracy, delivery_gps_updated_at). O cliente afina-o no
--      rastreio enquanto a encomenda não for entregue (public.order_set_destination, só pela Edge
--      Function, que identifica o cliente pelo número e pelo email); o colportor que a leva é
--      avisado.
--   2. Quem entrega: o colportor com a entrega aceite, ou alguém da equipa com "Gerir encomendas",
--      partilha a posição enquanto a encomenda vai a caminho (expedida, em trânsito, saiu para
--      entrega): public.delivery_share_position. Fica a última posição e o trajeto recente (até
--      200 pontos) em public.delivery_positions, uma linha por encomenda.
--   3. A partilha pára sozinha quando a encomenda é entregue ou cancelada, e as posições apagam-se
--      7 dias depois (cron 'trajetos-limpeza'): é um dado pessoal de quem entrega.
--   4. Quem entrega vê o ponto do cliente, a distância e o seu trajeto: public.delivery_route_info.
--   5. Quem recebe vê a posição de quem entrega pela Edge Function (/track/live), só enquanto a
--      encomenda vai a caminho e com a posição recente.
--
-- Reverter: repor public.colporteur_my_deliveries de 20261108100000; drop das funções
-- public.delivery_share_position, public.delivery_stop_sharing,
-- public.delivery_route_info, public.order_set_destination, private.delivery_courier_kind,
-- private.in_angola e private.delivery_positions_stop, do gatilho orders_trajeto_para, da tabela
-- public.delivery_positions, do cron 'trajetos-limpeza' e das colunas delivery_gps_accuracy e
-- delivery_gps_updated_at.

-- ---------------------------------------------------------------------------
-- 1. O ponto de quem recebe
-- ---------------------------------------------------------------------------
alter table public.orders
  add column if not exists delivery_gps_accuracy real,
  add column if not exists delivery_gps_updated_at timestamptz;
comment on column public.orders.delivery_gps_accuracy is
  'Precisão do ponto de entrega, em metros, dita pelo telemóvel do cliente (no checkout ou no rastreio).';
comment on column public.orders.delivery_gps_updated_at is
  'Quando o cliente marcou ou afinou o ponto de entrega.';

-- Angola fica entre as latitudes -18,1 e -4,3 e as longitudes 11,6 e 24,1 (com folga): a mesma
-- conta que public.colporteur_set_location.
create or replace function private.in_angola(p_lat double precision, p_lng double precision)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_lat is not null and p_lng is not null
     and p_lat between -18.6 and -4.0 and p_lng between 11.3 and 24.5;
$$;
revoke all on function private.in_angola(double precision, double precision) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. A posição de quem entrega
-- ---------------------------------------------------------------------------
create table if not exists public.delivery_positions (
  order_id text primary key references public.orders (id) on delete cascade,
  courier_profile uuid not null references public.profiles (id) on delete cascade,
  courier_kind text not null check (courier_kind in ('colportor', 'equipa')),
  courier_name text not null default '' check (length(courier_name) <= 120),
  lat double precision not null,
  lng double precision not null,
  accuracy_m real,
  heading real,
  speed_mps real,
  started_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  stopped_at timestamptz,
  -- Os últimos pontos, para desenhar o caminho: [{"lat":…,"lng":…,"at":"…"}], no máximo 200.
  trail jsonb not null default '[]'::jsonb check (jsonb_typeof(trail) = 'array')
);
comment on table public.delivery_positions is
  'Posição de quem entrega (colportor ou equipa) enquanto a encomenda vai a caminho, e o trajeto recente. Apaga-se 7 dias depois de parar.';
create index if not exists delivery_positions_courier_idx on public.delivery_positions (courier_profile, updated_at desc);

alter table public.delivery_positions enable row level security;
revoke all on public.delivery_positions from public, anon, authenticated;
grant select on public.delivery_positions to authenticated;
grant all on public.delivery_positions to service_role;
drop policy if exists "delivery_positions: quem entrega ou a equipa lê" on public.delivery_positions;
create policy "delivery_positions: quem entrega ou a equipa lê" on public.delivery_positions
  for select to authenticated
  using (courier_profile = auth.uid() or private.has_permission('manage_orders'));

-- Quem pode entregar esta encomenda: o colportor com a entrega aceite, ou a equipa.
-- Devolve 'colportor', 'equipa' ou null.
create or replace function private.delivery_courier_kind(p_order_id text, p_user uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when p_user is null then null
    when exists (
      select 1 from public.colporteur_deliveries d join public.colporteurs c on c.id = d.colporteur_id
      where d.order_id = p_order_id and d.status = 'accepted' and c.profile_id = p_user
    ) then 'colportor'
    when private.has_permission('manage_orders') then 'equipa'
  end;
$$;
revoke all on function private.delivery_courier_kind(text, uuid) from public, anon, authenticated;

-- Quem entrega manda a posição. O telemóvel manda de 10 em 10 segundos, ou quando anda 25 m;
-- aqui ignora-se o que chega menos de 4 s depois do anterior (dois separadores abertos, um
-- telemóvel com pressa). O trajeto guarda um ponto quando anda pelo menos 15 m ou passa 1 minuto.
create or replace function public.delivery_share_position(
  p_order_id text, p_lat double precision, p_lng double precision,
  p_accuracy double precision default null, p_heading double precision default null, p_speed double precision default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_kind text;
  v_order public.orders;
  v_pos public.delivery_positions;
  v_last jsonb;
  v_name text;
  v_point jsonb;
  v_trail jsonb;
  v_moved_km double precision;
  v_have boolean;
begin
  if auth.uid() is null then raise exception 'Entre na sua conta para partilhar a localização.' using errcode = '42501'; end if;
  select * into v_order from public.orders where id = p_order_id;
  if not found then raise exception 'Encomenda não encontrada.'; end if;
  -- Entregue ou cancelada primeiro: depois da entrega, a colportora já não tem a entrega "aceite",
  -- e o telemóvel que ainda mandava a posição ouvia "só quem entrega" em vez de "terminou".
  if coalesce(v_order.status, '') = 'cancelled' or v_order.delivery_status in ('cancelled', 'delivered') then
    raise exception 'A encomenda já não está a caminho: a partilha terminou.';
  end if;
  v_kind := private.delivery_courier_kind(p_order_id, auth.uid());
  if v_kind is null then raise exception 'Só quem entrega esta encomenda partilha a localização.' using errcode = '42501'; end if;
  if coalesce(v_order.shipping_method, '') not in ('delivery', 'express') then
    raise exception 'Esta encomenda não tem entrega ao domicílio.';
  end if;
  if coalesce(v_order.delivery_status, '') not in ('shipped', 'in_transit', 'out_for_delivery') then
    raise exception 'Marque primeiro que a encomenda saiu para entrega.';
  end if;
  if not private.in_angola(p_lat, p_lng) then
    raise exception 'Essa localização fica fora de Angola.';
  end if;
  if p_accuracy is not null and (p_accuracy < 0 or p_accuracy > 5000) then
    raise exception 'Sinal de GPS fraco de mais (±% m): espere um pouco ao ar livre.', round(p_accuracy);
  end if;

  select * into v_pos from public.delivery_positions where order_id = p_order_id for update;
  v_have := found;
  if v_have and v_pos.stopped_at is null and v_pos.courier_profile = auth.uid() and v_pos.updated_at > now() - interval '4 seconds' then
    return jsonb_build_object('order_id', p_order_id, 'updated_at', v_pos.updated_at, 'skipped', true);
  end if;

  v_name := left(coalesce(
    case when v_kind = 'colportor' then (select c.full_name from public.colporteurs c where c.profile_id = auth.uid() limit 1) end,
    (select nullif(p.name, '') from public.profiles p where p.id = auth.uid()),
    'Estafeta'), 120);
  v_point := jsonb_build_object('lat', round(p_lat::numeric, 6), 'lng', round(p_lng::numeric, 6),
                                'at', to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'));

  if not v_have or v_pos.courier_profile <> auth.uid() or v_pos.stopped_at is not null then
    -- Começa (ou recomeça, ou outra pessoa pegou na entrega): trajeto novo.
    insert into public.delivery_positions as d (order_id, courier_profile, courier_kind, courier_name, lat, lng,
                                                accuracy_m, heading, speed_mps, started_at, updated_at, stopped_at, trail)
    values (p_order_id, auth.uid(), v_kind, v_name, p_lat, p_lng, p_accuracy, p_heading, p_speed, now(), now(), null,
            jsonb_build_array(v_point))
    on conflict (order_id) do update set
      courier_profile = excluded.courier_profile, courier_kind = excluded.courier_kind, courier_name = excluded.courier_name,
      lat = excluded.lat, lng = excluded.lng, accuracy_m = excluded.accuracy_m, heading = excluded.heading,
      speed_mps = excluded.speed_mps, started_at = now(), updated_at = now(), stopped_at = null,
      trail = excluded.trail;
  else
    v_last := v_pos.trail -> (jsonb_array_length(v_pos.trail) - 1);
    v_moved_km := private.km_between((v_last ->> 'lat')::double precision, (v_last ->> 'lng')::double precision, p_lat, p_lng);
    v_trail := v_pos.trail;
    if v_last is null or coalesce(v_moved_km, 1) >= 0.015
       or (v_last ->> 'at')::timestamptz < now() - interval '1 minute' then
      v_trail := v_trail || jsonb_build_array(v_point);
      if jsonb_array_length(v_trail) > 200 then
        v_trail := (select jsonb_agg(e order by i) from jsonb_array_elements(v_trail) with ordinality as t(e, i)
                    where i > jsonb_array_length(v_trail) - 200);
      end if;
    end if;
    update public.delivery_positions
    set lat = p_lat, lng = p_lng, accuracy_m = p_accuracy, heading = p_heading, speed_mps = p_speed,
        updated_at = now(), courier_name = v_name, trail = v_trail
    where order_id = p_order_id;
  end if;

  return jsonb_build_object(
    'order_id', p_order_id, 'updated_at', now(), 'skipped', false,
    'distance_km', case when coalesce(v_order.delivery_gps_lat, 0) <> 0 or coalesce(v_order.delivery_gps_lng, 0) <> 0
      then round(private.km_between(p_lat, p_lng, v_order.delivery_gps_lat, v_order.delivery_gps_lng)::numeric, 2) end
  );
end;
$$;
revoke all on function public.delivery_share_position(text, double precision, double precision, double precision, double precision, double precision) from public, anon;
grant execute on function public.delivery_share_position(text, double precision, double precision, double precision, double precision, double precision) to authenticated;

-- Parar de partilhar (o botão, ou sair da página).
create or replace function public.delivery_stop_sharing(p_order_id text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then raise exception 'Sem sessão.' using errcode = '42501'; end if;
  update public.delivery_positions set stopped_at = now()
  where order_id = p_order_id and stopped_at is null
    and (courier_profile = auth.uid() or private.has_permission('manage_orders'));
  return jsonb_build_object('order_id', p_order_id, 'stopped', true);
end;
$$;
revoke all on function public.delivery_stop_sharing(text) from public, anon;
grant execute on function public.delivery_stop_sharing(text) to authenticated;

-- O que quem entrega vê: o ponto do cliente (com a precisão e a hora), a morada e a partilha.
create or replace function public.delivery_route_info(p_order_id text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_kind text := private.delivery_courier_kind(p_order_id, auth.uid());
  v_o public.orders;
  v_p public.delivery_positions;
begin
  if v_kind is null then raise exception 'Sem acesso a esta entrega.' using errcode = '42501'; end if;
  select * into v_o from public.orders where id = p_order_id;
  if not found then raise exception 'Encomenda não encontrada.'; end if;
  select * into v_p from public.delivery_positions where order_id = p_order_id;
  return jsonb_build_object(
    'order_id', v_o.id,
    'order_number', coalesce(nullif(v_o.order_number, ''), v_o.id),
    'delivery_status', v_o.delivery_status,
    'courier_kind', v_kind,
    'destination', case when coalesce(v_o.delivery_gps_lat, 0) <> 0 or coalesce(v_o.delivery_gps_lng, 0) <> 0
      then jsonb_build_object('lat', v_o.delivery_gps_lat, 'lng', v_o.delivery_gps_lng,
                              'accuracy', v_o.delivery_gps_accuracy, 'updated_at', v_o.delivery_gps_updated_at) end,
    'address', coalesce(nullif(v_o.delivery_address_full, ''), ''),
    'reference', coalesce(v_o.delivery_reference, ''),
    'customer_name', coalesce(v_o.customer_name, ''),
    'phone', coalesce(v_o.phone, ''),
    'sharing', case when v_p.order_id is not null then jsonb_build_object(
      'lat', v_p.lat, 'lng', v_p.lng, 'accuracy', v_p.accuracy_m, 'updated_at', v_p.updated_at,
      'started_at', v_p.started_at, 'stopped_at', v_p.stopped_at, 'mine', v_p.courier_profile = auth.uid(),
      'courier_name', v_p.courier_name, 'trail', v_p.trail) end
  );
end;
$$;
revoke all on function public.delivery_route_info(text) from public, anon;
grant execute on function public.delivery_route_info(text) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. O cliente afina o ponto de entrega (pela Edge Function)
-- ---------------------------------------------------------------------------
create or replace function public.order_set_destination(
  p_order_id text, p_lat double precision, p_lng double precision, p_accuracy double precision default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_o public.orders;
  v_colporteur uuid;
  v_ref text;
  v_moved_km double precision;
begin
  perform private.assert_server();
  select * into v_o from public.orders where id = p_order_id for update;
  if not found then raise exception 'Encomenda não encontrada.'; end if;
  if coalesce(v_o.shipping_method, '') not in ('delivery', 'express') then
    raise exception 'Esta encomenda não tem entrega ao domicílio.';
  end if;
  if coalesce(v_o.status, '') = 'cancelled' or v_o.delivery_status in ('cancelled', 'delivered') then
    raise exception 'A encomenda já foi entregue ou cancelada: o ponto de entrega não muda.';
  end if;
  if not private.in_angola(p_lat, p_lng) then
    raise exception 'Esse ponto fica fora de Angola. Marque o sítio onde quer receber.';
  end if;
  if p_accuracy is not null and (p_accuracy < 0 or p_accuracy > 2000) then
    raise exception 'A localização está pouco precisa (±% m). Arraste o ponto no mapa até ao sítio certo.', round(p_accuracy);
  end if;

  v_moved_km := case when coalesce(v_o.delivery_gps_lat, 0) <> 0 or coalesce(v_o.delivery_gps_lng, 0) <> 0
    then private.km_between(v_o.delivery_gps_lat, v_o.delivery_gps_lng, p_lat, p_lng) end;
  update public.orders
  set delivery_gps_lat = round(p_lat::numeric, 6), delivery_gps_lng = round(p_lng::numeric, 6),
      delivery_gps_accuracy = case when p_accuracy is null then null else round(p_accuracy::numeric, 1) end,
      delivery_gps_updated_at = now()
  where id = v_o.id;

  -- O colportor que leva a encomenda fica a saber (o mapa dele mostra o ponto novo).
  v_ref := coalesce(nullif(v_o.order_number, ''), v_o.id);
  select d.colporteur_id into v_colporteur from public.colporteur_deliveries d
  where d.order_id = v_o.id and d.status = 'accepted' limit 1;
  if v_colporteur is not null and coalesce(v_moved_km, 1) >= 0.02 then
    perform private.notify_colporteur(v_colporteur, 'O cliente afinou o ponto de entrega — ' || v_ref,
      'O ponto de entrega da encomenda ' || v_ref || ' mudou' ||
      case when v_moved_km is not null then ' ' || replace(round((v_moved_km * 1000)::numeric)::text, '.', ',') || ' m' else '' end ||
      '. Veja-o no mapa da entrega.', v_o.id);
  end if;

  return jsonb_build_object('order_id', v_o.id, 'lat', round(p_lat::numeric, 6), 'lng', round(p_lng::numeric, 6),
    'accuracy', case when p_accuracy is null then null else round(p_accuracy::numeric, 1) end,
    'updated_at', now(), 'moved_m', case when v_moved_km is not null then round((v_moved_km * 1000)::numeric) end);
end;
$$;
revoke all on function public.order_set_destination(text, double precision, double precision, double precision) from public, anon, authenticated;
grant execute on function public.order_set_destination(text, double precision, double precision, double precision) to service_role;

-- ---------------------------------------------------------------------------
-- 4. A partilha pára com a entrega, e as posições apagam-se
-- ---------------------------------------------------------------------------
create or replace function private.delivery_positions_stop()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.delivery_positions set stopped_at = now()
  where order_id = new.id and stopped_at is null;
  return null;
end;
$$;
revoke all on function private.delivery_positions_stop() from public, anon, authenticated;

drop trigger if exists orders_trajeto_para on public.orders;
create trigger orders_trajeto_para
  after update of status, delivery_status on public.orders
  for each row
  when (new.status = 'cancelled' or new.delivery_status in ('delivered', 'cancelled'))
  execute function private.delivery_positions_stop();

do $$
begin
  if exists (select 1 from cron.job where jobname = 'trajetos-limpeza') then
    perform cron.unschedule('trajetos-limpeza');
  end if;
  perform cron.schedule('trajetos-limpeza', '41 3 * * *',
    $job$delete from public.delivery_positions where coalesce(stopped_at, updated_at) < now() - interval '7 days'$job$);
exception when others then
  raise notice 'Não foi possível agendar a limpeza dos trajetos (%).', sqlerrm;
end
$$;

-- ---------------------------------------------------------------------------
-- 5. As entregas do colportor trazem a encomenda e a precisão do ponto
-- ---------------------------------------------------------------------------
-- Igual a 20261108100000_entregas_por_colportor, com 'order_id' (o mapa da entrega e a partilha
-- da posição pedem-no) e a precisão e a hora do ponto de entrega em 'gps'.
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
          'id', d.id, 'order_id', o.id, 'status', d.status, 'source', d.source, 'has_stock', d.has_stock, 'fee', d.fee,
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
                          then jsonb_build_object('lat', o.delivery_gps_lat, 'lng', o.delivery_gps_lng,
                                                  'accuracy', o.delivery_gps_accuracy, 'updated_at', o.delivery_gps_updated_at) end)
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
