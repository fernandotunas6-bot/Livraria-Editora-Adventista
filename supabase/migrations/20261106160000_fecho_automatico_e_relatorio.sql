-- Pedidos de ajuda à espera do cliente: aviso e fecho automático (como o "pending → solved" do
-- Zendesk), e o relatório semanal do atendimento.
--
-- Um pedido "a aguardar cliente" (a equipa respondeu) sem resposta do cliente:
--   * ao fim de (N - 2) dias recebe um aviso: "se não precisar de mais nada, fechamos a dd/mm";
--   * 2 dias depois do aviso, sem resposta, fecha, com mensagem e convite a avaliar.
-- N é configurável em Equipas e alertas (0 desliga; 7 por omissão). Qualquer mensagem do
-- cliente ou da equipa cancela o aviso. Depende de 20261106140000.

alter table public.staff_ops_settings
  add column if not exists auto_close_days smallint not null default 7;
alter table public.staff_ops_settings add constraint staff_ops_settings_auto_close_days_check
  check (auto_close_days = 0 or auto_close_days between 3 and 60);

alter table public.support_threads
  add column if not exists auto_close_warned_at timestamptz;

-- Uma mensagem nova (do cliente ou da equipa) ou uma mudança de estado cancela o aviso.
create or replace function private.support_threads_auto_close_reset()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.auto_close_warned_at is not null and (
    new.status is distinct from old.status
    or (new.last_message_at is distinct from old.last_message_at and new.last_sender_id is not null)
  ) then
    new.auto_close_warned_at := null;
  end if;
  return new;
end;
$$;
revoke all on function private.support_threads_auto_close_reset() from public, anon, authenticated;
create trigger support_threads_auto_close_reset
  before update on public.support_threads
  for each row execute function private.support_threads_auto_close_reset();

create or replace function private.run_support_auto_close()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_days integer;
  v_thread record;
  v_warned integer := 0;
  v_closed integer := 0;
  v_close_on text;
begin
  select auto_close_days into v_days from public.staff_ops_settings where id = 1;
  if coalesce(v_days, 0) = 0 then return jsonb_build_object('off', true); end if;

  -- 1. Aviso.
  for v_thread in
    select t.id, t.ticket_number, t.subject, t.customer_id, t.order_id
    from public.support_threads t
    where t.status = 'pending' and t.ticket_number is not null and t.auto_close_warned_at is null
      and t.last_message_at < now() - make_interval(days => greatest(v_days - 2, 1))
    limit 200
  loop
    v_close_on := to_char((now() + interval '2 days') at time zone 'Africa/Luanda', 'DD/MM');
    insert into public.support_messages (thread_id, sender_id, author_kind, body)
    values (v_thread.id, null, 'system',
      'Ainda precisa de ajuda com este pedido? Se não recebermos resposta, fechamos o pedido #'
        || v_thread.ticket_number || ' a ' || v_close_on || '. Pode responder aqui a qualquer momento.');
    update public.support_threads set auto_close_warned_at = now() where id = v_thread.id;
    if v_thread.customer_id is not null then
      insert into public.customer_notifications (customer_id, kind, title, body, href, thread_id, order_id)
      values (v_thread.customer_id, 'support', 'O seu pedido vai ser fechado',
        left('#' || v_thread.ticket_number || ' · ' || v_thread.subject || ' — sem resposta, fecha a ' || v_close_on || '.', 500),
        '/?atendimento=1', v_thread.id, v_thread.order_id);
    end if;
    v_warned := v_warned + 1;
  end loop;

  -- 2. Fecho, 2 dias depois do aviso.
  for v_thread in
    select t.id, t.ticket_number, t.subject, t.customer_id, t.order_id
    from public.support_threads t
    where t.status = 'pending' and t.auto_close_warned_at < now() - interval '2 days'
    limit 200
  loop
    update public.support_threads
    set status = 'closed', closed_at = now(), updated_at = now()
    where id = v_thread.id;
    insert into public.support_messages (thread_id, sender_id, author_kind, body)
    values (v_thread.id, null, 'system',
      'Fechámos este pedido por não termos tido resposta. Se ainda precisar de ajuda, escreva-nos no chat: começa uma conversa nova.');
    if v_thread.customer_id is not null then
      insert into public.customer_notifications (customer_id, kind, title, body, href, thread_id, order_id)
      values (v_thread.customer_id, 'support', 'Pedido fechado',
        left('#' || v_thread.ticket_number || ' · ' || v_thread.subject || '. Diga-nos como correu o atendimento.', 500),
        '/?atendimento=1', v_thread.id, v_thread.order_id);
    end if;
    v_closed := v_closed + 1;
  end loop;

  return jsonb_build_object('warned', v_warned, 'closed', v_closed);
end;
$$;
revoke all on function private.run_support_auto_close() from public, anon, authenticated;

-- Relatório semanal: segunda-feira às 06:35 UTC (07:35 em Luanda), antes de a loja abrir.
create or replace function private.run_weekly_report()
returns void
language plpgsql
security definer
set search_path = net, extensions
as $$
declare
  v_queue_url text;
  v_token text;
begin
  select decrypted_secret into v_queue_url from vault.decrypted_secrets where name = 'email_queue_url' limit 1;
  select decrypted_secret into v_token from vault.decrypted_secrets where name = 'email_queue_token' limit 1;
  if v_queue_url is null or v_token is null then
    raise notice 'Relatório semanal: faltam os segredos email_queue_url/email_queue_token no Vault.';
    return;
  end if;
  perform http_post(
    url := regexp_replace(v_queue_url, '(/functions/v1/app).*$', '\1') || '/cron/weekly-report',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-queue-token', v_token),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
end;
$$;
revoke execute on function private.run_weekly_report() from public, anon, authenticated;

do $$
begin
  perform cron.unschedule('fecho-pedidos');
exception when others then null;
end
$$;
do $$
begin
  perform cron.unschedule('relatorio-semanal');
exception when others then null;
end
$$;
do $$
begin
  -- De hora a hora, ao minuto 23.
  perform cron.schedule('fecho-pedidos', '23 * * * *', 'select private.run_support_auto_close();');
  perform cron.schedule('relatorio-semanal', '35 6 * * 1', 'select private.run_weekly_report();');
exception when others then
  raise notice 'Não foi possível agendar o fecho automático e o relatório (%).', sqlerrm;
end
$$;
