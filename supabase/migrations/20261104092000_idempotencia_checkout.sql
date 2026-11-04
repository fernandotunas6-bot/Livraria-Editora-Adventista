-- Chave de idempotência do checkout.
--
-- A rede cai muitas vezes entre o servidor gravar a encomenda e a resposta chegar ao
-- telemóvel: o cliente vê um erro, carrega outra vez, e ficavam duas encomendas com o stock
-- descontado duas vezes. O site manda agora uma chave por tentativa, e a Edge Function
-- devolve a encomenda que essa chave já criou.
--
-- O índice único é parcial: as encomendas antigas, e as que chegam de um site anterior a esta
-- versão, não têm chave e não colidem entre si. É ele que resolve dois pedidos simultâneos
-- com a mesma chave: o segundo `place_order` falha com 23505, a transacção (e o desconto de
-- stock) é desfeita, e a função devolve a encomenda do primeiro.
-- Só acrescenta: não muda dados nem permissões.

alter table public.orders add column if not exists idempotency_key text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.orders'::regclass and conname = 'orders_idempotency_key_format'
  ) then
    alter table public.orders add constraint orders_idempotency_key_format
      check (idempotency_key is null or idempotency_key ~ '^[A-Za-z0-9-]{16,64}$');
  end if;
end;
$$;

create unique index if not exists orders_idempotency_key_key
  on public.orders (idempotency_key)
  where idempotency_key is not null;

comment on column public.orders.idempotency_key is
  'Chave da tentativa de checkout enviada pelo site; repetir o pedido devolve esta encomenda.';
