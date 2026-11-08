-- Entregas por colportor, refinamento (depois de 20261108100000_entregas_por_colportor, já aplicada).
--
-- 1. Mínimo por entrega: o colportor ganha os portes da encomenda, nunca menos do que
--    colporteur_settings.delivery_min_fee. Com envio grátis os portes são 0, e a entrega não lhe
--    rendia nada. 0 por omissão (fica como estava até o dono escolher o valor).
-- 2. Quando outra pessoa marca a encomenda como entregue (o cliente a confirmar a recepção, ou a
--    equipa no painel) com a entrega ainda com o colportor:
--    - se ele já tinha os livros (do stock dele, ou levantados na loja), foi ele que entregou: fecha
--      como dele, com a guia de devolução e os portes;
--    - senão, a entrega dele é libertada, sem portes nem guia.
--    Nos dois casos é avisado. Antes, a entrega dele ficava aberta com a encomenda já entregue.
-- 3. private.colporteur_delivery_complete junta a guia, os portes e o fecho, para o passo do
--    colportor e o gatilho usarem o mesmo código. O passo liga app.colporteur_step, e assim o
--    gatilho não fecha a entrega uma segunda vez.

alter table public.colporteur_settings
  add column if not exists delivery_min_fee numeric(14,2) not null default 0;
alter table public.colporteur_settings drop constraint if exists colporteur_settings_delivery_check;
alter table public.colporteur_settings add constraint colporteur_settings_delivery_check
  check (delivery_offer_minutes between 10 and 1440 and delivery_near_km between 1 and 200
         and delivery_max_km between 1 and 500 and delivery_near_km <= delivery_max_km
         and delivery_min_fee between 0 and 100000);
comment on column public.colporteur_settings.delivery_min_fee is
  'O colportor ganha os portes da encomenda, nunca menos do que isto (envio grátis = 0 de portes). A diferença paga-a a Livraria. 0 = só os portes.';

-- Fecha uma entrega feita pelo colportor: a guia de devolução (se foi do stock dele), os portes
-- na conta e a entrega como 'delivered'. Usada quando ele marca "Entregue" e quando a encomenda é
-- dada como entregue por outra pessoa com os livros já com ele (foi ele que entregou).
create or replace function private.colporteur_delivery_complete(p_delivery uuid, p_actor uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_d public.colporteur_deliveries;
  v_o public.orders;
  v_doc uuid;
  v_ledger bigint;
begin
  select * into v_d from public.colporteur_deliveries where id = p_delivery for update;
  if v_d.status <> 'accepted' then return; end if;
  select * into v_o from public.orders where id = v_d.order_id;
  if v_d.source = 'stock' then
    v_doc := private.colporteur_return_for_order(v_d.colporteur_id, v_o, p_actor);
  end if;
  if v_d.fee > 0 then
    insert into public.colporteur_ledger (colporteur_id, kind, amount, description, order_id, actor)
    values (v_d.colporteur_id, 'taxa_entrega', -v_d.fee, 'Portes da entrega · ' || coalesce(nullif(v_o.order_number, ''), v_o.id), v_o.id, p_actor)
    returning id into v_ledger;
  end if;
  update public.colporteur_deliveries set status = 'delivered', delivered_at = now(), closed_at = now(),
    ledger_id = v_ledger, document_id = v_doc where id = p_delivery;
end;
$$;
revoke all on function private.colporteur_delivery_complete(uuid, uuid) from public, anon, authenticated;

-- O que ganha: os portes, com o mínimo das definições.
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
  -- Os portes da encomenda, com o mínimo das definições (envio grátis não lhe rende nada).
  v_fee := greatest(coalesce(v_order.shipping_cost, 0), coalesce(v_cfg.delivery_min_fee, 0));
  insert into public.colporteur_deliveries (order_id, colporteur_id, status, match_level, distance_km, has_stock, fee, offered_at, expires_at)
  values (p_order_id, v_cand.colporteur_id, 'offered', v_cand.level,
          case when v_cand.km is not null then round(v_cand.km::numeric, 1) end,
          v_cand.has_stock, v_fee, now(), v_expires);
  perform private.notify_colporteur(v_cand.colporteur_id, 'Entrega para si — ' || v_ref,
    'Encomenda paga em ' || private.order_place(v_order)
      || case when v_cand.km is not null then ' (a ' || round(v_cand.km::numeric, 1) || ' km)' else '' end
      || case when v_fee > 0 then '. Ganha ' || private.kz(v_fee) else '. Envio grátis: sem portes' end
      || case when v_cand.has_stock then '. Tem os livros consigo' else '. Os livros levantam-se na loja' end
      || '. Aceite até ' || to_char(v_expires at time zone 'Africa/Luanda', 'DD/MM "às" HH24:MI') || '.',
    p_order_id);
  return 'offered';
end;
$$;

-- A encomenda entregue sem ser pelo colportor fecha a entrega dele (ver o ponto 2 acima).
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

-- "Entregue" pelo colportor passa por private.colporteur_delivery_complete.
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
    -- Primeiro a guia e os portes (se faltarem os livros à consignação, pára aqui e nada muda);
    -- depois a encomenda, marcada como do colportor para o gatilho não a tratar outra vez.
    perform private.colporteur_delivery_complete(p_delivery, p_profile);
    perform set_config('app.colporteur_step', 'on', true);
    update public.orders
    set delivery_status = 'delivered', delivery_confirmed_at = now(), delivery_confirmed_by = v_name,
        delivery_recipient_name = v_name, delivery_recipient_id = left(btrim(coalesce(p_recipient_id, '')), 60),
        delivery_signature_data = p_signature
    where id = v_o.id;
    perform set_config('app.colporteur_step', '', true);
    select document_id, ledger_id into v_doc, v_ledger from public.colporteur_deliveries where id = p_delivery;

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
