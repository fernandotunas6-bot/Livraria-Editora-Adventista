-- Gateway de pagamentos: o webhook confirma os pagamentos sozinho.
--
-- Regra do dono (2026-11-07): um pagamento só fica confirmado pelo gateway de pagamentos, ou por
-- um funcionário com "Confirmar pagamentos" que processa o pagamento do cliente (migração
-- pagamentos_registados). Esta migração é o lado do gateway. O gateway chama a Edge Function
-- (`POST /webhooks/pagamentos`, corpo assinado em HMAC-SHA256 com o segredo partilhado); a
-- função verifica a assinatura e chama `public.order_payment_gateway`, que:
--   * ignora um reenvio da mesma transacção (fornecedor + id da transacção, índice único em
--     order_payments): o gateway repete enquanto não recebe 200, e nada conta duas vezes;
--   * só regista estados de pagamento concluído (paid, completed, success…); os outros ficam no
--     registo das chamadas, sem mexer na encomenda;
--   * encontra a encomenda pelo número (ENC-…), em qualquer grafia;
--   * grava o pagamento como confirmado (origem 'gateway'), com o valor que o gateway diz que
--     entrou: a menos, a encomenda fica paga em parte; a mais, a vigilância assinala "pago a mais";
--   * guarda como "órfão" o pagamento sem encomenda, para a equipa conciliar.
--
-- `public.payment_gateway_events`: cada chamada do webhook, também as recusadas por assinatura.
-- Só de acrescentar. Lêem-na quem gere encomendas e quem confirma pagamentos.
-- `payment_methods.gateway_provider`: o método é confirmado pelo gateway (vazio = pela equipa).
-- Num método com gateway, o cliente não indica referência: a confirmação é automática.
--
-- Reverter: drop function public.order_payment_gateway e drop table public.payment_gateway_events.

-- 1. Métodos confirmados pelo gateway --------------------------------------------------------------
alter table public.payment_methods drop constraint if exists payment_methods_gateway_provider_check;
alter table public.payment_methods add constraint payment_methods_gateway_provider_check
  check (coalesce(gateway_provider, '') ~ '^[a-z0-9_]{0,30}$') not valid;
do $$
begin
  alter table public.payment_methods validate constraint payment_methods_gateway_provider_check;
exception when check_violation then
  raise warning 'Há métodos de pagamento com gateway_provider fora da regra: corrija-os no painel.';
end
$$;
comment on column public.payment_methods.gateway_provider is
  'Gateway que confirma este método por webhook (ex.: generico). Vazio = a equipa confirma.';

-- 2. Registo das chamadas do webhook -------------------------------------------------------------------
create table if not exists public.payment_gateway_events (
  id bigint generated always as identity primary key,
  received_at timestamptz not null default now(),
  provider text not null default '',
  transaction_id text not null default '',
  order_ref text not null default '',
  order_id text,
  payment_id uuid,
  amount numeric(14,2),
  gateway_status text not null default '',
  -- recorded: pagamento gravado; duplicate: reenvio; orphan: sem encomenda; ignored: estado
  -- que não é pagamento concluído; rejected: assinatura ou dados inválidos.
  outcome text not null check (outcome in ('recorded', 'duplicate', 'orphan', 'ignored', 'rejected')),
  detail text not null default '' check (length(detail) <= 500),
  payload jsonb not null default '{}'::jsonb,
  ip text not null default ''
);
comment on table public.payment_gateway_events is
  'Cada chamada do webhook do gateway de pagamentos (também as recusadas). Só de acrescentar.';
create index if not exists payment_gateway_events_received_idx on public.payment_gateway_events (received_at desc);
create index if not exists payment_gateway_events_order_idx on public.payment_gateway_events (order_id) where order_id is not null;
create index if not exists payment_gateway_events_outcome_idx on public.payment_gateway_events (outcome, received_at desc);

alter table public.payment_gateway_events enable row level security;
revoke all on public.payment_gateway_events from public, anon, authenticated;
grant select on public.payment_gateway_events to authenticated;
grant all on public.payment_gateway_events to service_role;
drop policy if exists "payment_gateway_events: encomendas ou pagamentos lêem" on public.payment_gateway_events;
create policy "payment_gateway_events: encomendas ou pagamentos lêem" on public.payment_gateway_events
  for select to authenticated using ((select private.can_read_payments()));

create or replace function private.payment_gateway_events_append_only()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' and old.received_at < now() - interval '2 years' then
    return old;
  end if;
  raise exception 'O registo do gateway não se altera nem se apaga.' using errcode = '42501';
end;
$$;
revoke all on function private.payment_gateway_events_append_only() from public, anon, authenticated;
drop trigger if exists payment_gateway_events_append_only on public.payment_gateway_events;
create trigger payment_gateway_events_append_only
  before update or delete on public.payment_gateway_events
  for each row execute function private.payment_gateway_events_append_only();

-- Payload grande (um gateway que manda o recibo inteiro) não enche a tabela.
create or replace function private.gateway_payload(p jsonb)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select case when p is null then '{}'::jsonb
              when octet_length(p::text) > 20000 then jsonb_build_object('cortado', true, 'tamanho', octet_length(p::text))
              else p end;
$$;
revoke all on function private.gateway_payload(jsonb) from public, anon, authenticated;

-- 3. O webhook grava o pagamento -------------------------------------------------------------------------
create or replace function public.order_payment_gateway(
  p_provider text, p_transaction_id text, p_order_ref text, p_amount numeric,
  p_paid_at timestamptz default null, p_reference text default '', p_status text default 'paid',
  p_payload jsonb default '{}'::jsonb, p_ip text default ''
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_provider text := lower(left(regexp_replace(coalesce(p_provider, ''), '[^A-Za-z0-9_]', '', 'g'), 30));
  v_tx text := left(btrim(coalesce(p_transaction_id, '')), 120);
  v_ref text := left(btrim(coalesce(p_order_ref, '')), 80);
  v_key text := upper(regexp_replace(coalesce(p_order_ref, ''), '\s', '', 'g'));
  v_status text := lower(btrim(coalesce(p_status, '')));
  v_amount numeric(14,2) := round(p_amount, 2);
  v_payload jsonb := private.gateway_payload(p_payload);
  v_order public.orders;
  v_existing public.order_payments;
  v_id uuid;
  v_before text;
  v_at timestamptz;
begin
  perform private.assert_payments_writer();
  if v_provider = '' then raise exception 'Fornecedor do gateway em falta.'; end if;
  if v_tx = '' then raise exception 'Transacção sem identificador.'; end if;

  -- O mesmo aviso outra vez: devolve o que já foi gravado.
  perform pg_advisory_xact_lock(hashtext('gateway:' || v_provider || ':' || v_tx));
  select * into v_existing from public.order_payments where provider = v_provider and transaction_id = v_tx;
  if found then
    insert into public.payment_gateway_events (provider, transaction_id, order_ref, order_id, payment_id, amount, gateway_status, outcome, detail, payload, ip)
    values (v_provider, v_tx, v_ref, v_existing.order_id, v_existing.id, v_amount, v_status, 'duplicate', 'Transacção já registada.', v_payload, left(coalesce(p_ip, ''), 80));
    return private.order_payment_result(v_existing.order_id, v_existing.id, null, jsonb_build_object('outcome', 'duplicate'));
  end if;

  if v_status not in ('paid', 'completed', 'complete', 'success', 'succeeded', 'successful', 'confirmed', 'approved',
                      'captured', 'accepted', 'ok', 'pago', 'paga', 'concluido', 'concluído', 'aprovado') then
    insert into public.payment_gateway_events (provider, transaction_id, order_ref, amount, gateway_status, outcome, detail, payload, ip)
    values (v_provider, v_tx, v_ref, v_amount, v_status, 'ignored', 'Estado do gateway não é pagamento concluído.', v_payload, left(coalesce(p_ip, ''), 80));
    return jsonb_build_object('outcome', 'ignored', 'gateway_status', v_status);
  end if;
  if v_amount is null or v_amount <= 0 or v_amount > 1000000000 then
    insert into public.payment_gateway_events (provider, transaction_id, order_ref, amount, gateway_status, outcome, detail, payload, ip)
    values (v_provider, v_tx, v_ref, v_amount, v_status, 'rejected', 'Valor inválido.', v_payload, left(coalesce(p_ip, ''), 80));
    return jsonb_build_object('outcome', 'rejected', 'detail', 'Valor inválido.');
  end if;

  select * into v_order from public.orders o
  where (v_key <> '' and upper(regexp_replace(coalesce(o.order_number, ''), '\s', '', 'g')) = v_key) or o.id = v_ref
  order by o.created desc
  limit 1
  for update;
  if not found then
    insert into public.payment_gateway_events (provider, transaction_id, order_ref, amount, gateway_status, outcome, detail, payload, ip)
    values (v_provider, v_tx, v_ref, v_amount, v_status, 'orphan', 'Nenhuma encomenda com este número: conciliar à mão.', v_payload, left(coalesce(p_ip, ''), 80));
    return jsonb_build_object('outcome', 'orphan', 'order_ref', v_ref, 'amount', v_amount);
  end if;
  v_before := v_order.payment_status;
  -- A data do gateway, sem passar de agora (relógios desacertados) nem de 30 dias antes da encomenda.
  v_at := greatest(least(coalesce(p_paid_at, now()), now()), v_order.created - interval '30 days');

  perform set_config('app.payments_write', 'on', true);
  insert into public.order_payments (order_id, kind, status, amount, method_code, method_name, reference, notes, source,
                                     provider, transaction_id, received_at, decided_at)
  values (v_order.id, 'payment', 'confirmed', v_amount, coalesce(v_order.payment_method_code, ''),
          left(coalesce(v_order.payment_method_name, ''), 120), left(btrim(coalesce(p_reference, '')), 120),
          'Confirmado pelo gateway (' || v_provider || ').', 'gateway', v_provider, v_tx, v_at, now())
  returning id into v_id;
  perform set_config('app.payments_write', '', true);
  perform private.order_payments_sync(v_order.id);

  insert into public.payment_gateway_events (provider, transaction_id, order_ref, order_id, payment_id, amount, gateway_status, outcome, payload, ip)
  values (v_provider, v_tx, v_ref, v_order.id, v_id, v_amount, v_status, 'recorded', v_payload, left(coalesce(p_ip, ''), 80));
  perform private.audit_write('order_payments', v_id::text, 'insert',
    'Encomenda ' || coalesce(nullif(v_order.order_number, ''), v_order.id) || ': pagamento confirmado pelo gateway '
      || v_provider || ', ' || private.kz(v_amount) || ' (transacção ' || v_tx || ')',
    jsonb_build_object('status', jsonb_build_object('de', null, 'para', 'confirmed'), 'amount', v_amount,
                       'provider', v_provider, 'transaction_id', v_tx), false);

  return private.order_payment_result(v_order.id, v_id, v_before,
    jsonb_build_object('outcome', 'recorded', 'provider', v_provider, 'transaction_id', v_tx));
end;
$$;
revoke all on function public.order_payment_gateway(text, text, text, numeric, timestamptz, text, text, jsonb, text) from public, anon, authenticated;
grant execute on function public.order_payment_gateway(text, text, text, numeric, timestamptz, text, text, jsonb, text) to service_role;
