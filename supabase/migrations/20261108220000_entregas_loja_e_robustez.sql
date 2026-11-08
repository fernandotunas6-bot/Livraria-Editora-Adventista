-- Entregas por colportor: a loja de levantamento, e o que não pode falhar nem duplicar.
--
-- 1. De que loja saem os livros. Há lojas em poucas províncias (hoje Benguela, Huambo e Huíla), e
--    o colportor sem os livros à consignação só sabia que «os livros levantam-se na loja». Agora a
--    oferta guarda a loja (a da província dele, depois a mais perto por GPS, depois a da província
--    do cliente), o colportor vê a morada e o horário, e a equipa dessa loja é que recebe «Preparar
--    para o colportor».
-- 2. Sem os livros e sem loja por perto, o colportor não recebe a oferta: não a podia cumprir, e o
--    cliente perdia o prazo de cada oferta até a encomenda chegar à equipa. Sem lojas registadas
--    não há esta regra.
-- 3. Uma falha a oferecer já não trava o pagamento (que pode vir do webhook do gateway), e uma
--    encomenda com problema já não pára o agendador. O agendador volta a tentar.
-- 4. A equipa expede uma encomenda com uma oferta à espera: a oferta fecha e a encomenda fica com a
--    equipa. Antes o colportor ainda a podia aceitar, e havia duas entregas.
--
-- Reverter: drop do gatilho orders_entrega_equipa_expediu e das funções
-- orders_entrega_equipa_expediu, delivery_pickup_store e plain_text; repor as outras funções da
-- 20261108100000 e da 20261108170000; drop da coluna colporteur_deliveries.pickup_store_id.

alter table public.colporteur_deliveries
  add column if not exists pickup_store_id text references public.physical_stores (id) on delete set null;
comment on column public.colporteur_deliveries.pickup_store_id is
  'A loja onde o colportor levanta os livros, quando não os tem todos à consignação. Vazio: sem loja por perto, ou entrega do stock dele.';
create index if not exists colporteur_deliveries_pickup_store_idx on public.colporteur_deliveries (pickup_store_id)
  where pickup_store_id is not null;

-- ---------------------------------------------------------------------------
-- 1. A loja de levantamento
-- ---------------------------------------------------------------------------
-- A província das lojas é texto escrito à mão («Huíla», «Huila»): compara-se sem acentos.
create or replace function private.plain_text(p text)
returns text
language sql
immutable
set search_path = ''
as $$
  select lower(btrim(translate(coalesce(p, ''), 'áàâãéêíóôõúüçÁÀÂÃÉÊÍÓÔÕÚÜÇ', 'aaaaeeiooouucaaaaeeiooouuc')));
$$;
revoke all on function private.plain_text(text) from public, anon, authenticated;

-- A loja onde este colportor pode levantar os livros de uma encomenda, ou nada se não houver
-- nenhuma ao alcance dele.
create or replace function private.delivery_pickup_store(p_colporteur uuid, p_order_province text)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  with me as (
    select c.latitude::double precision as lat, c.longitude::double precision as lng, p.name as province
    from public.colporteurs c
    left join public.angola_provinces p on p.id = c.province_id
    where c.id = p_colporteur
  ),
  cfg as (select coalesce(max(delivery_max_km), 50) as max_km from public.colporteur_settings where id = 1),
  s as (
    select s.id, s.name, s.sort_order,
      me.province is not null and private.plain_text(s.province) = private.plain_text(me.province) as in_mine,
      private.plain_text(s.province) = private.plain_text(p_order_province) as in_order,
      case when me.lat is not null and me.lng is not null and coalesce(s.latitude, 0) <> 0 and coalesce(s.longitude, 0) <> 0
           then private.km_between(me.lat, me.lng, s.latitude, s.longitude) end as km
    from public.physical_stores s, me
    where s.active
  )
  select s.id
  from s, cfg
  where s.in_mine or s.in_order or (s.km is not null and s.km <= cfg.max_km)
  order by case when s.in_mine then 0 when s.km is not null and s.km <= cfg.max_km then 1 else 2 end,
           s.km asc nulls last, s.sort_order, s.name
  limit 1;
$$;
revoke all on function private.delivery_pickup_store(uuid, text) from public, anon, authenticated;

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
  from c, cfg, o
  where ((c.km is not null and c.km <= cfg.max_km) or c.same_mun or c.same_prov)
    -- Sem os livros, tem de haver uma loja onde os levantar. Sem lojas registadas, não há esta regra.
    and (c.has_stock
         or not exists (select 1 from public.physical_stores s where s.active)
         or private.delivery_pickup_store(c.id, o.delivery_province) is not null)
  order by case when c.km is not null and c.km <= cfg.near_km then 0
                when c.same_mun then 1
                when c.km is not null and c.km <= cfg.max_km then 2
                else 3 end,
           c.has_stock desc, c.km asc nulls last, c.busy asc, c.last_offer asc nulls first;
$$;

-- A oferta guarda a loja, e o aviso diz qual.
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
  v_fee numeric;
  v_store text;
  v_store_name text;
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
        then 'Nenhum colportor disponível perto de ' || private.order_place(v_order) || '. A encomenda está paga: a equipa entrega.'
        else 'Nenhum dos ' || v_tried || ' colportor(es) a quem foi oferecida a aceitou. A encomenda está paga: a equipa entrega.' end,
      p_order_id, null, 'high');
    return 'loja';
  end if;

  v_expires := private.business_deadline(now(), v_cfg.delivery_offer_minutes);
  -- Os portes da encomenda, com o mínimo das definições (envio grátis não lhe rende nada).
  v_fee := greatest(coalesce(v_order.shipping_cost, 0), coalesce(v_cfg.delivery_min_fee, 0));
  if not v_cand.has_stock then
    v_store := private.delivery_pickup_store(v_cand.colporteur_id, v_order.delivery_province);
    select name into v_store_name from public.physical_stores where id = v_store;
  end if;
  insert into public.colporteur_deliveries (order_id, colporteur_id, status, match_level, distance_km, has_stock, fee, offered_at, expires_at, pickup_store_id)
  values (p_order_id, v_cand.colporteur_id, 'offered', v_cand.level,
          case when v_cand.km is not null then round(v_cand.km::numeric, 1) end,
          v_cand.has_stock, v_fee, now(), v_expires, v_store);
  perform private.notify_colporteur(v_cand.colporteur_id, 'Entrega para si — ' || v_ref,
    'Encomenda paga em ' || private.order_place(v_order)
      || case when v_cand.km is not null then ' (a ' || round(v_cand.km::numeric, 1) || ' km)' else '' end
      || case when v_fee > 0 then '. Ganha ' || private.kz(v_fee) else '. Envio grátis: sem portes' end
      || case when v_cand.has_stock then '. Tem os livros consigo' else '. Os livros levantam-se ' || coalesce('em ' || v_store_name, 'na loja') end
      || '. Aceite até ' || to_char(v_expires at time zone 'Africa/Luanda', 'DD/MM "às" HH24:MI') || '.',
    p_order_id);
  return 'offered';
end;
$$;

-- ---------------------------------------------------------------------------
-- 2 e 3. O colportor aceita, e o pagamento e o agendador protegidos
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
  v_store text;
  v_store_name text;
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
  -- A loja fica decidida: a equipa prepara ali, mesmo que o colportor mude de localização depois.
  if v_source = 'loja' then
    v_store := coalesce(v_d.pickup_store_id, private.delivery_pickup_store(v_c.id, v_o.delivery_province));
    select name into v_store_name from public.physical_stores where id = v_store;
  end if;
  update public.colporteur_deliveries set status = 'accepted', responded_at = now(), source = v_source, pickup_store_id = v_store
  where id = p_delivery;
  update public.orders
  set delivery_colporteur_id = v_c.id, delivery_route = 'colportor',
      delivery_status = case when coalesce(delivery_status, '') in ('', 'received') then 'confirmed' else delivery_status end
  where id = v_o.id;
  perform private.notify_staff(case when v_source = 'loja' then 'preparation' else 'delivery' end,
    coalesce(v_store, private.order_store_id(v_o.shipping_method, v_o.pickup_store)), 'colporteur_delivery',
    case when v_source = 'loja' then 'Preparar para o colportor — ' || v_ref else 'Colportor entrega do stock dele — ' || v_ref end,
    v_c.full_name || ' (' || coalesce(v_c.code, '—') || ', ' || v_c.phone || ') aceitou entregar a encomenda '
      || v_ref || ' em ' || private.order_place(v_o)
      || case when v_source = 'loja'
           then '. Prepare os livros' || coalesce(' em ' || v_store_name, '') || ' para o colportor levantar e marque "Entregue ao colportor" na encomenda.'
           else ', com os livros que tem à consignação.' end,
    v_o.id, null, case when v_source = 'loja' then 'high' else 'normal' end);
  return jsonb_build_object('order_id', v_o.id, 'status', 'accepted', 'source', v_source,
                            'previous_delivery_status', coalesce(v_o.delivery_status, ''));
end;
$$;

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
    -- Uma falha a oferecer não pode travar o pagamento, que pode vir do gateway. O agendador volta
    -- a tentar de 5 em 5 minutos.
    begin
      perform private.offer_next_delivery(new.id);
    exception when others then
      raise warning 'Oferta da encomenda % ficou por fazer: %', new.id, sqlerrm;
    end;
  end if;
  -- A equipa marcou "Entregue" (no painel, ou o cliente confirmou a recepção) com a encomenda
  -- ainda com um colportor. Se ele já tinha os livros (do stock dele ou levantados na loja), foi ele
  -- que entregou: fecha como dele, com a guia e os portes. Senão, a entrega dele é libertada, sem
  -- portes nem guia. Nos dois casos é avisado.
  if new.delivery_status = 'delivered' and old.delivery_status is distinct from 'delivered'
     and coalesce(current_setting('app.colporteur_step', true), '') <> 'on' then
    for r in
      select id, colporteur_id, status, source, picked_up_at from public.colporteur_deliveries
      where order_id = new.id and status in ('offered', 'accepted')
    loop
      if r.status = 'accepted' and (r.source = 'stock' or r.picked_up_at is not null) then
        -- Tinha os livros: foi ele que entregou (o cliente confirmou antes de ele o marcar).
        begin
          perform private.colporteur_delivery_complete(r.id, null);
          perform private.notify_colporteur(r.colporteur_id, 'Entrega confirmada — ' || coalesce(nullif(new.order_number, ''), new.id),
            'A encomenda foi dada como entregue (pelo cliente ou pela equipa) quando já tinha os livros consigo. A entrega fica registada como sua, com os portes.', new.id);
          continue;
        exception when others then
          -- Por exemplo, já não tem os livros à consignação: não se pode fazer a guia sozinho.
          raise warning 'Entrega % confirmada pelo cliente sem fechar a do colportor: %', r.id, sqlerrm;
        end;
      end if;
      update public.colporteur_deliveries set status = 'released', closed_at = now(),
        reason = 'A encomenda foi marcada como entregue sem ser pelo colportor.'
      where id = r.id;
      perform private.notify_colporteur(r.colporteur_id, 'Entrega fechada — ' || coalesce(nullif(new.order_number, ''), new.id),
        'A encomenda foi marcada como entregue sem ser por si. Se a entregou, fale com a equipa para receber os portes.', new.id);
    end loop;
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
    -- Uma encomenda com problema não pára as outras: fica como estava, para a volta seguinte.
    begin
      update public.colporteur_deliveries set status = 'expired', closed_at = now() where id = r.id;
      perform private.offer_next_delivery(r.order_id);
      v_n := v_n + 1;
    exception when others then
      raise warning 'Entrega %: a oferta seguinte ficou por fazer: %', r.id, sqlerrm;
    end;
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
    begin
      if private.offer_next_delivery(r.id) in ('offered', 'loja') then v_n := v_n + 1; end if;
    exception when others then
      raise warning 'Oferta da encomenda % ficou por fazer: %', r.id, sqlerrm;
    end;
  end loop;
  return v_n;
end;
$$;

-- O que se lê: a loja na área do colportor, no painel da encomenda e no quadro.
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
          -- A loja só interessa enquanto os livros estão por levantar.
          'pickup_store', case when (d.status = 'offered' and not d.has_stock)
                                 or (d.status = 'accepted' and d.source = 'loja' and d.picked_up_at is null) then (
              select jsonb_build_object('name', s.name, 'address', s.address, 'hours', s.hours, 'phone', s.phone,
                                        'whatsapp', s.whatsapp, 'maps_url', s.maps_url)
              from public.physical_stores s where s.id = d.pickup_store_id) end,
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
          'pickup_store', (select s.name from public.physical_stores s where s.id = d.pickup_store_id),
          'colporteur', jsonb_build_object('id', c.id, 'name', c.full_name, 'code', c.code, 'phone', c.phone)
        ) order by d.offered_at)
        from public.colporteur_deliveries d join public.colporteurs c on c.id = d.colporteur_id
        where d.order_id = o.id), '[]'::jsonb))
    from public.orders o where o.id = p_order_id
  );
end;
$$;

create or replace function public.colporteur_deliveries_board(p_days integer default 30)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_days integer := least(greatest(coalesce(p_days, 30), 1), 366);
  v_since timestamptz := now() - make_interval(days => least(greatest(coalesce(p_days, 30), 1), 366));
begin
  if not (private.has_permission('manage_orders') or private.can_manage_colporteurs()) then
    raise exception 'Sem acesso.' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'days', v_days,
    'active', coalesce((
      select jsonb_agg(x order by x ->> 'sort') from (
        select jsonb_build_object(
          'sort', case when d.status = 'accepted' and d.source = 'loja' and d.picked_up_at is null then '0'
                       when d.status = 'offered' then '1' else '2' end || to_char(d.offered_at, 'YYYYMMDDHH24MISS'),
          'id', d.id, 'status', d.status, 'source', d.source, 'has_stock', d.has_stock, 'fee', d.fee,
          'distance_km', d.distance_km, 'match_level', d.match_level, 'offered_at', d.offered_at,
          'expires_at', d.expires_at, 'responded_at', d.responded_at, 'picked_up_at', d.picked_up_at,
          'order_id', o.id, 'order_number', coalesce(nullif(o.order_number, ''), o.id),
          'delivery_status', o.delivery_status, 'place', private.order_place(o),
          'pickup_store', (select s.name from public.physical_stores s where s.id = d.pickup_store_id),
          'items', (select coalesce(sum(greatest(coalesce((it ->> 'quantity')::int, 1), 0)), 0)::int
                    from jsonb_array_elements(case when jsonb_typeof(o.items) = 'array' then o.items else '[]'::jsonb end) it),
          'colporteur', jsonb_build_object('id', c.id, 'name', c.full_name, 'code', c.code, 'phone', c.phone)
        ) as x
        from public.colporteur_deliveries d
        join public.orders o on o.id = d.order_id
        join public.colporteurs c on c.id = d.colporteur_id
        where d.status in ('offered', 'accepted')
      ) s), '[]'::jsonb),
    'to_team', coalesce((
      select jsonb_agg(jsonb_build_object(
          'order_id', o.id, 'order_number', coalesce(nullif(o.order_number, ''), o.id),
          'delivery_status', o.delivery_status, 'place', private.order_place(o),
          'reason', (select d.reason from public.colporteur_deliveries d where d.order_id = o.id
                     order by coalesce(d.closed_at, d.offered_at) desc limit 1)
        ) order by o.created)
      from (
        select * from public.orders o
        where o.delivery_route = 'loja'
          and coalesce(o.status, '') not in ('cancelled', 'delivered')
          and coalesce(o.delivery_status, '') not in ('cancelled', 'delivered')
        order by o.created
        limit 100
      ) o), '[]'::jsonb),
    'by_colporteur', coalesce((
      select jsonb_agg(jsonb_build_object(
          'id', s.id, 'name', s.full_name, 'code', s.code, 'offered', s.offered, 'delivered', s.delivered,
          'declined', s.declined, 'expired', s.expired, 'released', s.released, 'active', s.active, 'fees', s.fees
        ) order by s.delivered desc, s.offered desc, s.full_name)
      from (
        select c.id, c.full_name, c.code,
          count(*) filter (where d.offered_at >= v_since)::int as offered,
          count(*) filter (where d.status = 'delivered' and d.delivered_at >= v_since)::int as delivered,
          count(*) filter (where d.status = 'declined' and d.offered_at >= v_since)::int as declined,
          count(*) filter (where d.status = 'expired' and d.offered_at >= v_since)::int as expired,
          count(*) filter (where d.status = 'released' and d.offered_at >= v_since)::int as released,
          count(*) filter (where d.status in ('offered', 'accepted'))::int as active,
          coalesce(sum(d.fee) filter (where d.status = 'delivered' and d.delivered_at >= v_since), 0) as fees
        from public.colporteur_deliveries d
        join public.colporteurs c on c.id = d.colporteur_id
        where d.offered_at >= v_since or d.delivered_at >= v_since or d.status in ('offered', 'accepted')
        group by c.id, c.full_name, c.code
      ) s), '[]'::jsonb),
    'totals', (
      select jsonb_build_object(
        'offered', count(*) filter (where d.offered_at >= v_since),
        'delivered', count(*) filter (where d.status = 'delivered' and d.delivered_at >= v_since),
        'declined', count(*) filter (where d.status = 'declined' and d.offered_at >= v_since),
        'expired', count(*) filter (where d.status = 'expired' and d.offered_at >= v_since),
        'released', count(*) filter (where d.status = 'released' and d.offered_at >= v_since),
        'fees', coalesce(sum(d.fee) filter (where d.status = 'delivered' and d.delivered_at >= v_since), 0),
        -- Encomendas (não ofertas) que foram a um colportor e acabaram entregues por um.
        'orders_offered', count(distinct d.order_id) filter (where d.offered_at >= v_since),
        'orders_by_colporteur', count(distinct d.order_id) filter (where d.status = 'delivered' and d.delivered_at >= v_since))
      from public.colporteur_deliveries d)
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. A equipa expediu com uma oferta à espera
-- ---------------------------------------------------------------------------
create or replace function private.orders_entrega_equipa_expediu()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  r record;
  v_havia boolean := false;
begin
  for r in
    select id, colporteur_id from public.colporteur_deliveries
    where order_id = new.id and status = 'offered'
    for update
  loop
    v_havia := true;
    update public.colporteur_deliveries
    set status = 'released', closed_at = now(), reason = 'A equipa já expediu a encomenda.'
    where id = r.id;
    perform private.notify_colporteur(r.colporteur_id, 'Entrega fechada — ' || coalesce(nullif(new.order_number, ''), new.id),
      'A equipa já expediu esta encomenda: não é preciso responder à oferta.', new.id);
  end loop;
  if v_havia then
    update public.orders set delivery_route = 'loja' where id = new.id;
  end if;
  return null;
end;
$$;
revoke all on function private.orders_entrega_equipa_expediu() from public, anon, authenticated;

drop trigger if exists orders_entrega_equipa_expediu on public.orders;
create trigger orders_entrega_equipa_expediu
  after update on public.orders
  for each row when (
    old.delivery_status is distinct from new.delivery_status
    and new.delivery_status in ('shipped', 'in_transit', 'out_for_delivery')
  )
  execute function private.orders_entrega_equipa_expediu();
