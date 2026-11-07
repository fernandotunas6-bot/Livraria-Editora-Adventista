-- Atendimento, segunda ronda:
--
--   1. A resposta da equipa a um pedido de ajuda chega ao cliente por email e push (até aqui só
--      ficava no aviso dentro do site, que o cliente só via se voltasse). Cada aviso guarda se
--      já foi enviado, como os da equipa.
--   2. Respostas rápidas da equipa: textos guardados, com {nome}, {pedido} e {encomenda}.
--   3. O agendador dos avisos deixa de chamar a Edge Function de 2 em 2 minutos fora do horário
--      quando só há avisos que esperam pela abertura.
--
-- Depende de 20261107020000_equipas_alertas_e_prazos.sql.

-- ---------------------------------------------------------------------------
-- 1. Avisos ao cliente enviados por email/push
-- ---------------------------------------------------------------------------
alter table public.customer_notifications
  add column if not exists dispatched_at timestamptz;
-- Os que já existem não saem agora.
update public.customer_notifications set dispatched_at = created_at where dispatched_at is null;
create index if not exists customer_notifications_dispatch_idx
  on public.customer_notifications (created_at) where dispatched_at is null and kind = 'support';

-- ---------------------------------------------------------------------------
-- 2. Respostas rápidas
-- ---------------------------------------------------------------------------
create table public.support_saved_replies (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(btrim(title)) between 2 and 80),
  body text not null check (char_length(btrim(body)) between 2 and 2000),
  created_by uuid references public.profiles (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index support_saved_replies_title_key on public.support_saved_replies (lower(btrim(title)));
create trigger support_saved_replies_touch before update on public.support_saved_replies
  for each row execute function private.touch_updated_at();

alter table public.support_saved_replies enable row level security;
revoke all on public.support_saved_replies from public, anon, authenticated;
grant select, insert, update, delete on public.support_saved_replies to authenticated;
create policy "support_saved_replies: atendimento usa e gere" on public.support_saved_replies for all to authenticated
  using ((select private.has_permission('manage_orders')))
  with check ((select private.has_permission('manage_orders')));

insert into public.support_saved_replies (title, body, created_by) values
  ('Pagamento confirmado', 'Olá {nome}, confirmámos o pagamento da encomenda {encomenda}. Já está na fila de preparação e avisamos quando sair. Obrigado!', null),
  ('A tratar do assunto', 'Olá {nome}, obrigado pela paciência. Estamos a tratar do seu pedido {pedido} e respondemos aqui assim que tivermos novidades.', null),
  ('Pedir comprovativo', 'Olá {nome}, para confirmarmos o pagamento da encomenda {encomenda}, pode enviar-nos aqui a referência ou o número do comprovativo da transferência?', null),
  ('Devolução aceite', 'Olá {nome}, a devolução da encomenda {encomenda} foi aceite. Combinamos consigo a recolha ou a entrega numa das nossas lojas; o reembolso é feito depois de recebermos e conferirmos o livro.', null)
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- 3. Agendador: só chama a função quando há algo para enviar agora
-- ---------------------------------------------------------------------------
create or replace function private.run_staff_dispatch()
returns void
language plpgsql
security definer
set search_path = net, extensions
as $$
declare
  v_queue_url text;
  v_token text;
  v_open boolean;
  v_local timestamp := now() at time zone 'Africa/Luanda';
begin
  select (extract(isodow from v_local)::smallint = any (s.open_days)
          and extract(hour from v_local) >= s.open_hour
          and extract(hour from v_local) < s.close_hour)
  into v_open
  from public.staff_ops_settings s where s.id = 1;
  v_open := coalesce(v_open, true);

  -- Com a loja fechada, só o crítico sai para a equipa (o resto espera pela abertura); as
  -- respostas aos clientes saem a qualquer hora.
  if not exists (
    select 1 from public.staff_notifications n
    where n.dispatched_at is null and n.created_at > now() - interval '2 days'
      and (v_open or n.severity = 'critical')
  ) and not exists (
    select 1 from public.customer_notifications c
    where c.dispatched_at is null and c.kind = 'support' and c.created_at > now() - interval '2 days'
  ) then
    return;
  end if;

  select decrypted_secret into v_queue_url from vault.decrypted_secrets where name = 'email_queue_url' limit 1;
  select decrypted_secret into v_token from vault.decrypted_secrets where name = 'email_queue_token' limit 1;
  if v_queue_url is null or v_token is null then
    raise notice 'Avisos: faltam os segredos email_queue_url/email_queue_token no Vault.';
    return;
  end if;
  perform http_post(
    url := regexp_replace(v_queue_url, '(/functions/v1/app).*$', '\1') || '/cron/staff-dispatch',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-queue-token', v_token),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
end;
$$;
revoke execute on function private.run_staff_dispatch() from public, anon, authenticated;
