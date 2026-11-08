-- O estado geral da encomenda (`orders.status`) passa a acompanhar a entrega e o pagamento.
--
-- Até aqui o `status` (Pendente, Confirmada, Enviada, Cancelada) só mudava à mão, no painel,
-- ou para "cancelled". A entrega (`delivery_status`) e o pagamento andavam e ele ficava para
-- trás. Em produção a 2026-11-07, a ENC-ZC8QZO4P2 estava paga e entregue com o estado
-- "pending":
--   * o cliente via no perfil, lado a lado, "Pendente" e "Entregue";
--   * o painel contava-a nas "pendentes";
--   * o relatório de vendas por estado punha quase tudo em "Pendente".
-- A vigilância (orderWatch.ts) até já tratava `status = 'delivered'`, que nada gravava.
--
-- Regra (gatilho `orders_a_estado_geral`, antes dos outros `BEFORE`, para o
-- `orders_before_update` ver o estado final):
--   * cancelada é definitiva: nada a reabre daqui;
--   * entrega cancelada → cancelada;
--   * entrega mexeu: entregue → 'delivered' (Concluída); expedida, em trânsito ou saiu para
--     entrega → 'shipped'; confirmada ou em preparação → 'confirmed';
--   * ainda "pendente" com a encomenda paga, ou com a entrega já adiantada → avança.
-- O que a equipa escolhe à mão continua a valer até a entrega voltar a mexer. Os avisos ao
-- cliente não mudam: `notify_order_activity` só avisa pelo estado geral quando é
-- "cancelada"; os passos da entrega já tinham avisos próprios.
--
-- Para reverter: `drop trigger orders_a_estado_geral on public.orders;` (as encomendas
-- actualizadas aqui ficam com o estado novo, que é o certo).

create or replace function private.order_status_follows_progress()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_derived text;
begin
  if new.status = 'cancelled' then
    return new;
  end if;
  if new.delivery_status = 'cancelled' then
    new.status := 'cancelled';
    return new;
  end if;
  v_derived := case
    when new.delivery_status = 'delivered' then 'delivered'
    when new.delivery_status in ('shipped', 'in_transit', 'out_for_delivery') then 'shipped'
    when new.delivery_status in ('confirmed', 'preparing', 'processing') then 'confirmed'
  end;
  if v_derived is not null and (tg_op = 'INSERT' or new.delivery_status is distinct from old.delivery_status) then
    new.status := v_derived;
  elsif coalesce(new.status, 'pending') = 'pending' and (v_derived is not null or new.payment_status = 'paid') then
    new.status := coalesce(v_derived, 'confirmed');
  end if;
  return new;
end;
$$;
revoke execute on function private.order_status_follows_progress() from public, anon, authenticated;

drop trigger if exists orders_a_estado_geral on public.orders;
create trigger orders_a_estado_geral
  before insert or update of status, delivery_status, payment_status on public.orders
  for each row execute function private.order_status_follows_progress();

-- As encomendas que já estão para trás (em produção: as duas entregues).
update public.orders o
set status = d.derived
from (
  select id, case
      when delivery_status = 'delivered' then 'delivered'
      when delivery_status in ('shipped', 'in_transit', 'out_for_delivery') then 'shipped'
      when delivery_status in ('confirmed', 'preparing', 'processing') or payment_status = 'paid' then 'confirmed'
    end as derived
  from public.orders
  where coalesce(status, 'pending') <> 'cancelled' and coalesce(delivery_status, '') <> 'cancelled'
) d
where o.id = d.id
  and d.derived is not null
  and o.status is distinct from d.derived
  -- Só para a frente: uma "Confirmada" à mão sem entrega mexida fica como está.
  and (case coalesce(o.status, 'pending') when 'delivered' then 3 when 'shipped' then 2 when 'confirmed' then 1 else 0 end)
    < (case d.derived when 'delivered' then 3 when 'shipped' then 2 when 'confirmed' then 1 else 0 end);
