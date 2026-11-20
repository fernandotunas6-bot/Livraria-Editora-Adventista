-- Webhook do gateway de pagamentos: o estado do pagamento passa a ser obrigatório.
--
-- Achado da análise crítica de 2026-11-20: quando o aviso não trazia estado (`status`, `state` ou
-- `payment_status`), a Edge Function e esta função tomavam-no por `paid`. Um aviso assinado de
-- outro tipo — um reembolso ou um estorno que use `event` em vez de `status` — ficava registado
-- como pagamento confirmado. O contrato (docs/PAGAMENTOS.md) sempre pediu o estado; agora quem
-- não o manda é recusado e fica no registo das chamadas como `rejected`.
--
-- Igual a 20261107201500, com duas diferenças: `p_status` deixa de valer 'paid' por omissão, e um
-- estado vazio é recusado antes de tudo o resto (a seguir ao reenvio, que continua a devolver o
-- que já foi gravado).
--
-- Reverter: repor public.order_payment_gateway de 20261107201500.

create or replace function public.order_payment_gateway(
  p_provider text, p_transaction_id text, p_order_ref text, p_amount numeric,
  p_paid_at timestamptz default null, p_reference text default '', p_status text default '',
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

  -- Sem estado não se sabe o que o gateway está a dizer (um reembolso? um pendente?): recusa-se,
  -- em vez de o tomar por pagamento concluído.
  if v_status = '' then
    insert into public.payment_gateway_events (provider, transaction_id, order_ref, amount, gateway_status, outcome, detail, payload, ip)
    values (v_provider, v_tx, v_ref, v_amount, v_status, 'rejected', 'Estado do pagamento em falta.', v_payload, left(coalesce(p_ip, ''), 80));
    return jsonb_build_object('outcome', 'rejected', 'detail', 'Estado do pagamento em falta.');
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
