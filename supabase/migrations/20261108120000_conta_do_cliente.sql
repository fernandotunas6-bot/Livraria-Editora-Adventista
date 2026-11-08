-- Conta do cliente e fila da equipa (2026-11-08, análise crítica por perfil).
--
-- 1. Avisos "Nova encomenda — assumir" que ficavam por ler depois de a encomenda estar tratada.
--    Só o botão "Assumir" (order_acknowledge) os fechava. Mexer no estado, no pagamento ou na
--    entrega também assume a encomenda (gatilho orders_implicit_acknowledge, migração
--    equipas_alertas_e_prazos), mas aí os avisos ficavam: a barra do painel continuava a pedir a
--    toda a equipa que assumisse encomendas já enviadas, entregues ou canceladas — incluindo as
--    canceladas sozinhas por falta de pagamento. Passam a fechar-se sempre que a encomenda fica
--    assumida, venha de onde vier, e os que já estão nesse estado fecham-se agora.
--
-- 2. Tipo de aviso `order_cancelled`: a encomenda foi cancelada pelo próprio cliente. Junta-se à
--    regra que existir (o padrão da colportagem_avisos), não a reescreve.
--
-- 3. public.order_cancel_by_customer: o cliente cancela uma encomenda sua. Até aqui não podia:
--    a mensagem do checkout ("Já tem 3 encomendas por pagar. Pague ou cancele uma…") mandava-o
--    cancelar sem lhe dar maneira de o fazer. Só a Edge Function a chama (rota /order/cancel), que
--    confirma primeiro que a encomenda é de quem pede. As regras ficam aqui, com a linha
--    bloqueada; as mesmas regras estão em app/web/src/lib/customerOrders.js e em
--    supabase/functions/app/customerCancel.ts (mudar um lado obriga a mudar os outros):
--      - ainda não paga: sem dinheiro registado (amount_paid = 0) e sem pagamento indicado à
--        espera de confirmação — com dinheiro pelo meio, cancelar é com a equipa (reembolso);
--      - ainda não saiu da fila: estado pendente ou confirmada, entrega recebida ou confirmada.
--    O stock volta pelo gatilho orders_before_update e o colportor (se havia) é avisado pelo
--    orders_entrega_colportor, como num cancelamento no painel.
--
-- Reverter: drop do trigger orders_assumida_fecha_avisos e das funções
-- private.orders_close_claim_notices e public.order_cancel_by_customer; tirar `order_cancelled`
-- da regra staff_notifications_kind_check (depois de apagar os avisos desse tipo).

-- ---------------------------------------------------------------------------------------------
-- 1. Avisos de "assumir" fecham-se quando a encomenda fica assumida
-- ---------------------------------------------------------------------------------------------
create or replace function private.orders_close_claim_notices()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.acknowledged_at is not null and old.acknowledged_at is null then
    update public.staff_notifications set read_at = coalesce(read_at, now())
    where order_id = new.id and kind in ('new_order', 'order_unacknowledged') and read_at is null;
    update public.order_alerts set resolved_at = now()
    where order_id = new.id and kind = 'new_unacknowledged' and resolved_at is null;
  end if;
  return null;
end;
$$;
revoke all on function private.orders_close_claim_notices() from public, anon, authenticated;

-- Sem `update of acknowledged_at`: essa forma só dispara quando a coluna está no SET do UPDATE,
-- e na assunção implícita quem a muda é outro gatilho (o BEFORE orders_implicit_acknowledge) —
-- exactamente o caso que falhava. O WHEN de um gatilho AFTER vê a linha final.
drop trigger if exists orders_assumida_fecha_avisos on public.orders;
create trigger orders_assumida_fecha_avisos
  after update on public.orders
  for each row
  when (old.acknowledged_at is null and new.acknowledged_at is not null)
  execute function private.orders_close_claim_notices();

-- Os que já estão por ler numa encomenda assumida (ou cancelada) fecham-se agora.
update public.staff_notifications n set read_at = now()
from public.orders o
where o.id = n.order_id
  and n.kind in ('new_order', 'order_unacknowledged')
  and n.read_at is null
  and (o.acknowledged_at is not null or o.status = 'cancelled');

update public.order_alerts a set resolved_at = now()
from public.orders o
where o.id = a.order_id
  and a.kind = 'new_unacknowledged'
  and a.resolved_at is null
  and (o.acknowledged_at is not null or o.status = 'cancelled');

-- ---------------------------------------------------------------------------------------------
-- 2. Tipo de aviso order_cancelled (junta-se à regra existente)
-- ---------------------------------------------------------------------------------------------
do $$
declare
  v_def text;
  v_kinds text[];
begin
  select pg_get_constraintdef(c.oid) into v_def
  from pg_constraint c
  where c.conrelid = 'public.staff_notifications'::regclass and c.conname = 'staff_notifications_kind_check';
  select coalesce(array_agg(distinct coalesce(m[1], m[2])), array[]::text[]) into v_kinds
  from regexp_matches(coalesce(v_def, ''), '''([a-z_]+)''|[{,]([a-z_]+)(?=[,}])', 'g') as m;
  if v_def is not null and cardinality(v_kinds) = 0 then
    raise exception 'staff_notifications_kind_check com um formato inesperado: %', v_def;
  end if;
  if not ('order_cancelled' = any (v_kinds)) then
    v_kinds := v_kinds || 'order_cancelled'::text;
  end if;
  alter table public.staff_notifications drop constraint if exists staff_notifications_kind_check;
  execute format('alter table public.staff_notifications add constraint staff_notifications_kind_check check (kind = any (array[%s]))',
    (select string_agg(quote_literal(k), ', ' order by k) from unnest(v_kinds) as k));
end
$$;

-- ---------------------------------------------------------------------------------------------
-- 3. O cliente cancela uma encomenda sua
-- ---------------------------------------------------------------------------------------------
create or replace function public.order_cancel_by_customer(p_order_id text, p_reason text default '')
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.orders;
  v_reason text := left(btrim(regexp_replace(coalesce(p_reason, ''), '\s+', ' ', 'g')), 300);
  v_note text;
  v_last int;
begin
  select * into v_order from public.orders where id = p_order_id for update;
  if not found then
    raise exception 'Encomenda não encontrada.';
  end if;
  if v_order.status = 'cancelled' or v_order.delivery_status = 'cancelled' then
    raise exception 'Esta encomenda já está cancelada.';
  end if;
  if v_order.status = 'delivered' or v_order.delivery_status = 'delivered' then
    raise exception 'Esta encomenda já foi entregue.';
  end if;
  if coalesce(v_order.amount_paid, 0) > 0
     or coalesce(v_order.payment_status, 'pending') in ('paid', 'partially_paid', 'refunded') then
    raise exception 'Esta encomenda já tem pagamento registado: para a cancelar, fale connosco, para tratarmos do reembolso.';
  end if;
  if coalesce(v_order.payment_status, 'pending') = 'awaiting_confirmation' then
    raise exception 'Indicou um pagamento nesta encomenda: para a cancelar, fale connosco, para confirmarmos o reembolso.';
  end if;
  if coalesce(v_order.status, 'pending') not in ('pending', 'confirmed')
     or coalesce(nullif(v_order.delivery_status, ''), 'received') not in ('received', 'confirmed') then
    raise exception 'A encomenda já está a ser preparada ou a caminho: para a cancelar, fale connosco.';
  end if;

  -- O mesmo que o cancelamento automático por falta de pagamento: estado e entrega. O gatilho
  -- orders_before_update repõe o stock e escreve "Cancelada" na linha do tempo.
  update public.orders set status = 'cancelled', delivery_status = 'cancelled' where id = v_order.id;

  -- Quem cancelou (e porquê) fica na linha do tempo, que o cliente vê no rastreio.
  v_note := 'Cancelada pelo cliente' || case when v_reason <> '' then ': ' || v_reason else '.' end;
  select jsonb_array_length(coalesce(delivery_timeline, '[]'::jsonb)) - 1 into v_last from public.orders where id = v_order.id;
  if v_last >= 0 then
    update public.orders
      set delivery_timeline = jsonb_set(delivery_timeline, array[v_last::text, 'description'], to_jsonb(v_note))
      where id = v_order.id and delivery_timeline -> v_last ->> 'status' = 'cancelled';
  end if;

  return jsonb_build_object(
    'order_id', v_order.id, 'order_number', coalesce(v_order.order_number, v_order.id),
    'total', v_order.total, 'customer_name', v_order.customer_name, 'reason', v_reason,
    'shipping_method', v_order.shipping_method, 'pickup_store', v_order.pickup_store,
    'acknowledged_by', v_order.acknowledged_by
  );
end;
$$;
revoke all on function public.order_cancel_by_customer(text, text) from public, anon, authenticated;
grant execute on function public.order_cancel_by_customer(text, text) to service_role;
