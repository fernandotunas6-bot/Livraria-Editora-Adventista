-- Entregas por colportor: dois casos que ficavam em aberto.
--
-- 1. A encomenda deixa de estar paga (reembolso) com a entrega em curso. Nada olhava para o
--    pagamento depois da oferta: o colportor podia entregar uma encomenda reembolsada e ganhar os
--    portes, contra a regra de só entregar encomendas pagas. Agora a entrega fecha como
--    'cancelled', e o colportor e a equipa são avisados. Se a encomenda voltar a ficar paga, vai ao
--    colportor seguinte, como uma encomenda nova. Uma entrega já feita não muda.
--
-- 2. O colportor deixa de estar activo (suspenso, inactivo) ou perde a conta. Nada fechava as
--    entregas dele: via os dados do cliente, marcava passos, e uma oferta ficava presa até ao prazo,
--    sem a poder aceitar. Agora fecham como 'released': a oferta, ou a entrega que ainda não saiu,
--    passa ao seguinte; a que já saiu ou tem os livros da loja com ele fica com a equipa, com
--    aviso urgente para os recuperar.
--
-- Reverter: drop dos gatilhos orders_entrega_sem_pagamento e colporteurs_entregas_fecham e das
-- funções com o mesmo nome.

-- ---------------------------------------------------------------------------
-- 1. A encomenda deixou de estar paga
-- ---------------------------------------------------------------------------
create or replace function private.orders_entrega_sem_pagamento()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  r record;
  v_ref text := coalesce(nullif(new.order_number, ''), new.id);
  v_livros boolean;
  v_saiu boolean := coalesce(new.delivery_status, '') in ('shipped', 'in_transit', 'out_for_delivery');
  v_havia boolean := false;
begin
  for r in
    select d.id, d.colporteur_id, d.status, d.source, d.picked_up_at, c.full_name
    from public.colporteur_deliveries d
    join public.colporteurs c on c.id = d.colporteur_id
    where d.order_id = new.id and d.status in ('offered', 'accepted')
    for update of d
  loop
    v_havia := true;
    v_livros := r.status = 'accepted' and r.source = 'loja' and r.picked_up_at is not null;
    update public.colporteur_deliveries
    set status = 'cancelled', closed_at = now(), reason = 'A encomenda deixou de estar paga.'
    where id = r.id;
    perform private.notify_colporteur(r.colporteur_id, 'Não entregue — ' || v_ref,
      case when v_livros then 'A encomenda deixou de estar paga: não a entregue e devolva os livros na loja.'
           else 'A encomenda deixou de estar paga: já não é para entregar.' end,
      new.id);
    perform private.notify_staff('delivery', null, 'colporteur_delivery', 'Entrega parada — ' || v_ref,
      'A encomenda deixou de estar paga e a entrega com ' || r.full_name || ' foi fechada.'
        || case when v_livros then ' Os livros da loja estão com o colportor: combine a devolução.'
                when v_saiu then ' Já tinha saído para entrega: confirme com o colportor.'
                else '' end,
      new.id, null, case when v_livros or v_saiu then 'high' else 'normal' end);
  end loop;

  if v_havia then
    -- Por sair, volta a poder ir a um colportor se ficar paga outra vez. Já expedida, é com a equipa.
    update public.orders
    set delivery_colporteur_id = null, delivery_route = case when v_saiu then 'loja' else '' end
    where id = new.id;
  end if;
  return null;
end;
$$;
revoke all on function private.orders_entrega_sem_pagamento() from public, anon, authenticated;

drop trigger if exists orders_entrega_sem_pagamento on public.orders;
create trigger orders_entrega_sem_pagamento
  after update on public.orders
  for each row when (old.payment_status = 'paid' and new.payment_status is distinct from 'paid')
  execute function private.orders_entrega_sem_pagamento();

-- ---------------------------------------------------------------------------
-- 2. O colportor deixou de poder entregar
-- ---------------------------------------------------------------------------
create or replace function private.colporteurs_entregas_fecham()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  r record;
  v_ref text;
  v_na_mao boolean;
  v_next text;
begin
  for r in
    select d.id, d.order_id, d.status, d.source, d.picked_up_at, o.order_number, o.delivery_status
    from public.colporteur_deliveries d
    join public.orders o on o.id = d.order_id
    where d.colporteur_id = new.id and d.status in ('offered', 'accepted')
    for update of d
  loop
    v_ref := coalesce(nullif(r.order_number, ''), r.order_id);
    v_na_mao := r.status = 'accepted' and (
      (r.source = 'loja' and r.picked_up_at is not null)
      or coalesce(r.delivery_status, '') in ('shipped', 'in_transit', 'out_for_delivery'));
    update public.colporteur_deliveries
    set status = 'released', closed_at = now(), reason = 'O colportor deixou de estar activo.'
    where id = r.id;

    if v_na_mao then
      update public.orders set delivery_colporteur_id = null, delivery_route = 'loja' where id = r.order_id;
      perform private.notify_staff('delivery', null, 'colporteur_delivery', 'Recuperar a entrega — ' || v_ref,
        new.full_name || ' deixou de estar activo com esta entrega em mãos. Recupere os livros e faça a entrega.',
        r.order_id, null, 'high');
    else
      update public.orders set delivery_colporteur_id = null, delivery_route = '' where id = r.order_id;
      v_next := private.offer_next_delivery(r.order_id);
      if r.status = 'accepted' then
        perform private.notify_staff('delivery', null, 'colporteur_delivery', 'Colportor deixou de estar activo — ' || v_ref,
          new.full_name || ' tinha aceitado esta entrega. '
            || case v_next when 'offered' then 'Foi oferecida ao colportor seguinte.' else 'Passou para a equipa.' end,
          r.order_id, null, 'high');
      end if;
    end if;

    perform private.notify_colporteur(new.id, 'Entrega retirada — ' || v_ref,
      'A sua conta de colportor deixou de estar activa: esta entrega já não está consigo.', r.order_id);
  end loop;
  return null;
end;
$$;
revoke all on function private.colporteurs_entregas_fecham() from public, anon, authenticated;

drop trigger if exists colporteurs_entregas_fecham on public.colporteurs;
create trigger colporteurs_entregas_fecham
  after update on public.colporteurs
  for each row when (
    (old.status = 'activo' and new.status is distinct from 'activo')
    or (old.profile_id is not null and new.profile_id is null)
  )
  execute function private.colporteurs_entregas_fecham();
